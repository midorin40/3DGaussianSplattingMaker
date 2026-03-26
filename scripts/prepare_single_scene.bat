@echo off
if "%~1"=="" (
  echo Usage: prepare_single_scene.bat ^<scene_dir^>
  exit /b 1
)
set SCENE_DIR=%~1
call "C:\Users\Lida\miniconda3\condabin\conda.bat" activate C:\GaussianSplatting\envs\gaussian_splatting_cuda12
python C:\WebApp\GaussianSplattingMaker\scripts\prepare_colmap_scene.py -s "%SCENE_DIR%" --colmap_executable "C:\GaussianSplatting\tools\COLMAP\COLMAP.bat"
