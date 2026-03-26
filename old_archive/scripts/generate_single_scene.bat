@echo off
if "%~1"=="" (
  echo Usage: generate_single_scene.bat ^<input_image^> ^<output_dir^> [preset]
  exit /b 1
)
if "%~2"=="" (
  echo Usage: generate_single_scene.bat ^<input_image^> ^<output_dir^> [preset]
  exit /b 1
)
set INPUT_IMAGE=%~1
set OUTPUT_DIR=%~2
set PRESET=%~3
if "%PRESET%"=="" set PRESET=standard
call "C:\Users\Lida\miniconda3\condabin\conda.bat" activate C:\GaussianSplatting\envs\gaussian_splatting_cuda12
python C:\WebApp\GaussianSplattingMaker\scripts\generate_single_views.py "%INPUT_IMAGE%" "%OUTPUT_DIR%" "%PRESET%"
