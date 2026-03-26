@echo off
if "%~1"=="" (
  echo Usage: export_splat.bat ^<input_ply^> ^<output_splat^>
  exit /b 1
)
if "%~2"=="" (
  echo Usage: export_splat.bat ^<input_ply^> ^<output_splat^>
  exit /b 1
)
call "C:\Users\Lida\miniconda3\condabin\conda.bat" activate C:\GaussianSplatting\envs\gaussian_splatting_cuda12
C:\GaussianSplatting\envs\gaussian_splatting_cuda12\Scripts\ply2splat.exe --input "%~1" --output "%~2"
