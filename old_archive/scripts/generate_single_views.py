import sys
from pathlib import Path

import cv2
import numpy as np


def build_variants(preset: str):
    preset = (preset or "standard").lower()
    if preset == "high":
        return [
            ("front", 0.00, 0.00, 1.00),
            ("left_soft", -0.05, -0.01, 0.99),
            ("right_soft", 0.05, 0.01, 0.99),
            ("left", -0.10, -0.02, 0.98),
            ("right", 0.10, 0.02, 0.98),
            ("up", 0.00, -0.08, 0.98),
            ("down", 0.00, 0.08, 0.98),
            ("left_up", -0.08, -0.06, 0.97),
            ("right_up", 0.08, -0.06, 0.97),
        ]
    if preset == "fast":
        return [
            ("front", 0.00, 0.00, 1.00),
            ("left", -0.07, 0.00, 0.99),
            ("right", 0.07, 0.00, 0.99),
            ("up", 0.00, -0.05, 0.99),
        ]
    return [
        ("front", 0.00, 0.00, 1.00),
        ("left_soft", -0.04, -0.01, 0.995),
        ("right_soft", 0.04, 0.01, 0.995),
        ("left", -0.085, -0.01, 0.985),
        ("right", 0.085, 0.01, 0.985),
        ("up", 0.00, -0.065, 0.99),
        ("down", 0.00, 0.065, 0.99),
    ]


def ensure_alpha(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    elif image.shape[2] == 3:
        alpha = np.full((image.shape[0], image.shape[1], 1), 255, dtype=np.uint8)
        image = np.concatenate([image, alpha], axis=2)
    return image


def feather_mask(alpha: np.ndarray) -> np.ndarray:
    mask = alpha.astype(np.float32) / 255.0
    if mask.max() < 0.05:
        mask[:] = 1.0
    blur = cv2.GaussianBlur(mask, (0, 0), sigmaX=5, sigmaY=5)
    return np.clip(0.6 * mask + 0.4 * blur, 0.0, 1.0)


def estimate_depth(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[:, :, :3].astype(np.float32) / 255.0
    alpha = feather_mask(rgba[:, :, 3])
    gray = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    gy, gx = np.gradient(gray)
    edge = np.sqrt(gx * gx + gy * gy)
    edge = cv2.GaussianBlur(edge, (0, 0), sigmaX=3, sigmaY=3)
    edge = edge / (edge.max() + 1e-6)

    h, w = gray.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx = (xx - (w - 1) / 2.0) / max(w, 1)
    yy = (yy - (h - 1) / 2.0) / max(h, 1)
    radial = np.sqrt(xx * xx + yy * yy)
    radial = 1.0 - np.clip(radial / (radial.max() + 1e-6), 0.0, 1.0)

    luminance_depth = 1.0 - gray
    depth = 0.45 * luminance_depth + 0.25 * radial + 0.30 * edge
    depth *= alpha
    depth = cv2.GaussianBlur(depth, (0, 0), sigmaX=7, sigmaY=7)
    if depth.max() > depth.min():
        depth = (depth - depth.min()) / (depth.max() - depth.min())
    return np.clip(depth, 0.0, 1.0)


def make_background(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[:, :, :3]
    alpha = feather_mask(rgba[:, :, 3])
    bg = np.full_like(rgb, 255)
    inv = (1.0 - alpha)[..., None]
    composite = (rgb.astype(np.float32) * alpha[..., None] + bg.astype(np.float32) * inv).astype(np.uint8)
    return cv2.GaussianBlur(composite, (0, 0), sigmaX=11, sigmaY=11)


def warp_layer(layer: np.ndarray, mask: np.ndarray, yaw: float, pitch: float, scale: float, depth_value: float):
    h, w = layer.shape[:2]
    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])

    x_shift = yaw * w * (0.08 + 0.18 * depth_value)
    y_shift = pitch * h * (0.06 + 0.14 * depth_value)
    squeeze = abs(yaw) * w * (0.02 + 0.08 * depth_value)
    tilt = abs(pitch) * h * (0.02 + 0.05 * depth_value)

    dst = np.float32(
        [
            [0 + x_shift + squeeze, 0 + y_shift + tilt],
            [w - 1 + x_shift - squeeze, 0 + y_shift],
            [w - 1 + x_shift - squeeze, h - 1 + y_shift - tilt],
            [0 + x_shift + squeeze, h - 1 + y_shift],
        ]
    )
    center = np.array([w / 2.0, h / 2.0], dtype=np.float32)
    dst = (dst - center) * scale + center

    matrix = cv2.getPerspectiveTransform(src, dst)
    warped_layer = cv2.warpPerspective(layer, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    warped_mask = cv2.warpPerspective(mask, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return warped_layer, np.clip(warped_mask, 0.0, 1.0)


def render_variant(rgba: np.ndarray, depth: np.ndarray, yaw: float, pitch: float, scale: float) -> np.ndarray:
    rgb = rgba[:, :, :3]
    alpha = feather_mask(rgba[:, :, 3])
    background = make_background(rgba).astype(np.float32)
    h, w = alpha.shape
    canvas = background.copy()
    coverage = np.ones((h, w), dtype=np.float32)

    thresholds = np.linspace(0.0, 1.0, 6)
    for low, high in zip(thresholds[:-1], thresholds[1:]):
        depth_mask = np.logical_and(depth >= low, depth <= high).astype(np.float32) * alpha
        if depth_mask.max() < 0.01:
            continue
        layer = (rgb.astype(np.float32) * depth_mask[..., None] + background * (1.0 - depth_mask[..., None])).astype(np.uint8)
        depth_value = float((low + high) * 0.5)
        warped_layer, warped_mask = warp_layer(layer, depth_mask.astype(np.float32), yaw, pitch, scale, depth_value)
        warped_layer = warped_layer.astype(np.float32)
        composite_alpha = np.clip(warped_mask * (0.75 + 0.25 * depth_value), 0.0, 1.0)
        canvas = warped_layer * composite_alpha[..., None] + canvas * (1.0 - composite_alpha[..., None])
        coverage = np.maximum(coverage, composite_alpha)

    final_alpha = np.clip(np.maximum(alpha, coverage), 0.0, 1.0)
    return np.dstack([np.clip(canvas, 0, 255).astype(np.uint8), (final_alpha * 255).astype(np.uint8)])


def main():
    if len(sys.argv) < 3:
        print("Usage: generate_single_views.py <input_image> <output_dir> [preset]", file=sys.stderr)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    preset = sys.argv[3] if len(sys.argv) > 3 else "standard"

    output_dir.mkdir(parents=True, exist_ok=True)
    image = cv2.imread(str(input_path), cv2.IMREAD_UNCHANGED)
    if image is None:
        print(f"Failed to load image: {input_path}", file=sys.stderr)
        sys.exit(2)

    rgba = ensure_alpha(image)
    stem = input_path.stem
    depth = estimate_depth(rgba)

    for name, yaw, pitch, scale in build_variants(preset):
        rendered = render_variant(rgba, depth, yaw, pitch, scale)
        out_path = output_dir / f"{stem}-{name}.png"
        if not cv2.imwrite(str(out_path), rendered):
            print(f"Failed to write image: {out_path}", file=sys.stderr)
            sys.exit(3)

    print(f"Generated {len(build_variants(preset))} pseudo view(s) in {output_dir}")


if __name__ == "__main__":
    main()
