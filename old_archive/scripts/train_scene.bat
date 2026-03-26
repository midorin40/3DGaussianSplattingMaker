@echo off
if "%~1"=="" (
  echo Usage: train_scene.bat ^<scene_dir^> ^<model_dir^> [iterations] [resume_ckpt]
  exit /b 1
)
if "%~2"=="" (
  echo Usage: train_scene.bat ^<scene_dir^> ^<model_dir^> [iterations] [resume_ckpt]
  exit /b 1
)
set SCENE_DIR=%~1
set MODEL_DIR=%~2
set ITERATIONS=%~3
set RESUME_CKPT=%~4
if "%ITERATIONS%"=="" set ITERATIONS=30000
set RESUME_FLAG=
if not "%RESUME_CKPT%"=="" set RESUME_FLAG=--resume_ckpt "%RESUME_CKPT%"
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
set PATH=C:\GaussianSplatting\envs\gaussian_splatting_cuda12\Scripts;%PATH%
set PYTHONPATH=C:\GaussianSplatting\gsplat\examples;%PYTHONPATH%
set PYTHONUTF8=1
C:\GaussianSplatting\envs\gaussian_splatting_cuda12\python.exe C:\WebApp\GaussianSplattingMaker\scripts\gsplat_resume_runner.py default --disable-viewer --data-dir "%SCENE_DIR%" --data-factor 1 --result-dir "%MODEL_DIR%" --max-steps %ITERATIONS% --save-steps %ITERATIONS% --save-ply --ply-steps %ITERATIONS% --eval-steps %ITERATIONS% --disable-video %RESUME_FLAG%
