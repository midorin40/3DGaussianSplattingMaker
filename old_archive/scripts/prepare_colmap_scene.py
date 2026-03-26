from argparse import ArgumentParser
import logging
import os
import shutil


parser = ArgumentParser("COLMAP scene converter")
parser.add_argument("--no_gpu", action="store_true")
parser.add_argument("--source_path", "-s", required=True, type=str)
parser.add_argument("--camera", default="SIMPLE_PINHOLE", type=str)
parser.add_argument("--colmap_executable", default="", type=str)
args = parser.parse_args()

colmap_command = f'"{args.colmap_executable}"' if args.colmap_executable else "colmap"
use_gpu = 0 if args.no_gpu else 1
source = args.source_path


def run(cmd: str, label: str) -> None:
    code = os.system(cmd)
    if code != 0:
        logging.error("%s failed with code %s. Exiting.", label, code)
        raise SystemExit(code)


os.makedirs(os.path.join(source, "distorted", "sparse"), exist_ok=True)

feat_extract_cmd = (
    colmap_command
    + " feature_extractor"
    + " --database_path "
    + os.path.join(source, "distorted", "database.db")
    + " --image_path "
    + os.path.join(source, "input")
    + " --ImageReader.single_camera 1"
    + " --ImageReader.camera_model "
    + args.camera
    + " --SiftExtraction.max_num_features 16000"
    + " --FeatureExtraction.use_gpu "
    + str(use_gpu)
)
run(feat_extract_cmd, "Feature extraction")

feat_matching_cmd = (
    colmap_command
    + " exhaustive_matcher"
    + " --database_path "
    + os.path.join(source, "distorted", "database.db")
    + " --FeatureMatching.use_gpu "
    + str(use_gpu)
)
run(feat_matching_cmd, "Feature matching")

mapper_cmd = (
    colmap_command
    + " mapper"
    + " --database_path "
    + os.path.join(source, "distorted", "database.db")
    + " --image_path "
    + os.path.join(source, "input")
    + " --output_path "
    + os.path.join(source, "distorted", "sparse")
    + " --Mapper.ba_global_function_tolerance=0.000001"
    + " --Mapper.init_min_num_inliers 12"
    + " --Mapper.init_max_error 12"
    + " --Mapper.init_max_forward_motion 0.999"
    + " --Mapper.init_min_tri_angle 0.05"
    + " --Mapper.abs_pose_min_num_inliers 8"
    + " --Mapper.abs_pose_min_inlier_ratio 0.03"
    + " --Mapper.filter_max_reproj_error 12"
    + " --Mapper.tri_ignore_two_view_tracks 0"
    + " --Mapper.multiple_models 0"
)
run(mapper_cmd, "Mapper")

img_undist_cmd = (
    colmap_command
    + " image_undistorter"
    + " --image_path "
    + os.path.join(source, "input")
    + " --input_path "
    + os.path.join(source, "distorted", "sparse", "0")
    + " --output_path "
    + source
    + " --output_type COLMAP"
)
run(img_undist_cmd, "Image undistorter")

model_converter_cmd = (
    colmap_command
    + " model_converter"
    + " --input_path "
    + os.path.join(source, "sparse")
    + " --output_path "
    + os.path.join(source, "sparse")
    + " --output_type TXT"
)
run(model_converter_cmd, "Model converter")

files = os.listdir(os.path.join(source, "sparse"))
os.makedirs(os.path.join(source, "sparse", "0"), exist_ok=True)
for file_name in files:
    if file_name == "0":
        continue
    source_file = os.path.join(source, "sparse", file_name)
    destination_file = os.path.join(source, "sparse", "0", file_name)
    shutil.move(source_file, destination_file)

for file_name in ("cameras.bin", "images.bin", "points3D.bin", "rigs.bin", "frames.bin"):
    file_path = os.path.join(source, "sparse", "0", file_name)
    if os.path.exists(file_path):
        os.remove(file_path)

print("Done.")
