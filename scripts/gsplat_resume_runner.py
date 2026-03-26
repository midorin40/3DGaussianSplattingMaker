import argparse
from pathlib import Path


EXAMPLES_DIR = Path(r"C:\GaussianSplatting\gsplat\examples")
SOURCE_FILE = EXAMPLES_DIR / "simple_trainer.py"
PATCH_PREFIX = r'''
import sys
sys.path.insert(0, r"C:\GaussianSplatting\gsplat\examples")

from collections import OrderedDict
from pathlib import Path
import numpy as np
from pycolmap.scene_manager import SceneManager
from pycolmap.camera import Camera
from pycolmap.image import Image
from pycolmap.rotation import Quaternion


def _patched_load_colmap_project_file(self, project_file=None, image_path=None):
    if project_file is None:
        project_file = self.folder + 'project.ini'

    self.image_path = image_path

    if self.image_path is None:
        try:
            with open(project_file, 'r', encoding='utf8') as f:
                for line in iter(f.readline, ''):
                    if line.startswith('image_path'):
                        self.image_path = line[11:].strip()
                        break
        except Exception:
            pass

    if self.image_path is None:
        images_dir = Path(self.folder).resolve().parent.parent / 'images'
        if images_dir.exists():
            self.image_path = str(images_dir)

    if self.image_path is None:
        print('Warning: image_path not found for reconstruction')
    elif not self.image_path.endswith('/'):
        self.image_path += '/'


def _patched_load_cameras_txt(self, input_file):
    self.cameras = OrderedDict()
    with open(input_file, 'r', encoding='utf8') as f:
        for line in iter(lambda: f.readline().strip(), ''):
            if not line or line.startswith('#'):
                continue
            data = line.split()
            camera_id = int(data[0])
            self.cameras[camera_id] = Camera(
                data[1],
                int(data[2]),
                int(data[3]),
                [float(x) for x in data[4:]],
            )
            self.last_camera_id = max(self.last_camera_id, camera_id)


def _patched_load_images_txt(self, input_file):
    self.images = OrderedDict()
    self.name_to_image_id = dict()
    with open(input_file, 'r', encoding='utf8') as f:
        is_camera_description_line = False
        for line in iter(lambda: f.readline().strip(), ''):
            if not line or line.startswith('#'):
                continue
            is_camera_description_line = not is_camera_description_line
            data = line.split()
            if is_camera_description_line:
                image_id = int(data[0])
                image = Image(
                    data[-1],
                    int(data[-2]),
                    Quaternion(np.array([float(x) for x in data[1:5]], dtype=np.float64)),
                    np.array([float(x) for x in data[5:8]], dtype=np.float64),
                )
            else:
                image.points2D = np.array(
                    [[float(data[i]), float(data[i + 1])] for i in range(0, len(data), 3)],
                    dtype=np.float64,
                ) if data else np.empty((0, 2), dtype=np.float64)
                image.point3D_ids = np.array(
                    [np.uint64(data[i]) for i in range(2, len(data), 3)],
                    dtype=np.uint64,
                ) if data else np.empty((0,), dtype=np.uint64)
                self.images[image_id] = image
                self.name_to_image_id[image.name] = image_id
                self.last_image_id = max(self.last_image_id, image_id)


def _patched_load_points3D_txt(self, input_file):
    self.points3D = []
    self.point3D_ids = []
    self.point3D_colors = []
    self.point3D_id_to_point3D_idx = dict()
    self.point3D_id_to_images = dict()
    self.point3D_errors = []
    with open(input_file, 'r', encoding='utf8') as f:
        for line in iter(lambda: f.readline().strip(), ''):
            if not line or line.startswith('#'):
                continue
            data = line.split()
            point3D_id = np.uint64(data[0])
            self.point3D_ids.append(point3D_id)
            self.point3D_id_to_point3D_idx[point3D_id] = len(self.points3D)
            self.points3D.append([np.float64(x) for x in data[1:4]])
            self.point3D_colors.append([np.uint8(x) for x in data[4:7]])
            self.point3D_errors.append(np.float64(data[7]))
            track = [np.uint32(x) for x in data[8:]]
            self.point3D_id_to_images[point3D_id] = np.array(track, dtype=np.uint32).reshape(-1, 2)
    self.points3D = np.array(self.points3D, dtype=np.float64)
    self.point3D_ids = np.array(self.point3D_ids, dtype=np.uint64)
    self.point3D_colors = np.array(self.point3D_colors, dtype=np.uint8)
    self.point3D_errors = np.array(self.point3D_errors, dtype=np.float64)


def _patched_load_cameras(self, input_file=None):
    if input_file is not None:
        return _patched_load_cameras_txt(self, input_file)

    bin_file = self.folder + 'cameras.bin'
    txt_file = self.folder + 'cameras.txt'
    if Path(bin_file).exists():
        try:
            return self._load_cameras_bin(bin_file)
        except Exception as exc:
            if Path(txt_file).exists():
                print(f'Warning: failed to load {bin_file}, falling back to TXT: {exc}')
                return _patched_load_cameras_txt(self, txt_file)
            raise
    if Path(txt_file).exists():
        return _patched_load_cameras_txt(self, txt_file)
    raise IOError('no cameras file found')


def _patched_load_images(self, input_file=None):
    if input_file is not None:
        return _patched_load_images_txt(self, input_file)

    bin_file = self.folder + 'images.bin'
    txt_file = self.folder + 'images.txt'
    if Path(bin_file).exists():
        try:
            return self._load_images_bin(bin_file)
        except Exception as exc:
            if Path(txt_file).exists():
                print(f'Warning: failed to load {bin_file}, falling back to TXT: {exc}')
                return _patched_load_images_txt(self, txt_file)
            raise
    if Path(txt_file).exists():
        return _patched_load_images_txt(self, txt_file)
    raise IOError('no images file found')


def _patched_load_points3D(self, input_file=None):
    if input_file is not None:
        return _patched_load_points3D_txt(self, input_file)

    bin_file = self.folder + 'points3D.bin'
    txt_file = self.folder + 'points3D.txt'
    if Path(bin_file).exists():
        try:
            return self._load_points3D_bin(bin_file)
        except Exception as exc:
            if Path(txt_file).exists():
                print(f'Warning: failed to load {bin_file}, falling back to TXT: {exc}')
                return _patched_load_points3D_txt(self, txt_file)
            raise
    if Path(txt_file).exists():
        return _patched_load_points3D_txt(self, txt_file)
    raise IOError('no points3D file found')


SceneManager.load_colmap_project_file = _patched_load_colmap_project_file
SceneManager._load_cameras_txt = _patched_load_cameras_txt
SceneManager._load_images_txt = _patched_load_images_txt
SceneManager._load_points3D_txt = _patched_load_points3D_txt
SceneManager.load_cameras = _patched_load_cameras
SceneManager.load_images = _patched_load_images
SceneManager.load_points3D = _patched_load_points3D
'''


def load_patched_source() -> str:
    source = SOURCE_FILE.read_text(encoding="utf8")
    source = PATCH_PREFIX + source
    source = source.replace(
        "    ckpt: Optional[List[str]] = None\n    # Name of compression strategy to use\n",
        "    ckpt: Optional[List[str]] = None\n    # Path to a training checkpoint to continue from.\n    resume_ckpt: Optional[str] = None\n    # Name of compression strategy to use\n",
        1,
    )
    source = source.replace(
        "        max_steps = cfg.max_steps\n        init_step = 0\n",
        "        max_steps = cfg.max_steps\n        init_step = 0\n\n        if cfg.resume_ckpt is not None:\n            print(f\"Resuming training from {cfg.resume_ckpt}\")\n            ckpt = torch.load(cfg.resume_ckpt, map_location=device, weights_only=True)\n            for key in self.splats.keys():\n                self.splats[key].data = ckpt[\"splats\"][key].to(device)\n            if cfg.pose_opt and \"pose_adjust\" in ckpt:\n                if world_size > 1:\n                    self.pose_adjust.module.load_state_dict(ckpt[\"pose_adjust\"])\n                else:\n                    self.pose_adjust.load_state_dict(ckpt[\"pose_adjust\"])\n            if cfg.app_opt and \"app_module\" in ckpt:\n                if world_size > 1:\n                    self.app_module.module.load_state_dict(ckpt[\"app_module\"])\n                else:\n                    self.app_module.load_state_dict(ckpt[\"app_module\"])\n            init_step = int(ckpt.get(\"step\", -1)) + 1\n",
        1,
    )
    return source


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--resume_ckpt", default=None)
    args, remaining = parser.parse_known_args()

    source = load_patched_source()
    globals_dict = {"__name__": "__main__", "__file__": str(SOURCE_FILE)}
    if args.resume_ckpt:
        remaining = list(remaining) + ["--resume_ckpt", args.resume_ckpt]
    import sys

    sys.argv = [str(SOURCE_FILE)] + remaining
    exec(compile(source, str(SOURCE_FILE), "exec"), globals_dict)


if __name__ == "__main__":
    main()
