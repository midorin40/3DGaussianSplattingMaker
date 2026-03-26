@echo off
if "%~1"=="" (
  echo Usage: extract_frames.bat ^<input_video^> ^<output_dir^> [fps]
  exit /b 1
)
if "%~2"=="" (
  echo Usage: extract_frames.bat ^<input_video^> ^<output_dir^> [fps]
  exit /b 1
)
set INPUT_VIDEO=%~1
set OUTPUT_DIR=%~2
set FPS=%~3
if "%FPS%"=="" set FPS=12
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
ffmpeg -i "%INPUT_VIDEO%" -vf fps=%FPS% "%OUTPUT_DIR%\frame_%%05d.png"
