@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
call "C:\Users\Lida\miniconda3\condabin\conda.bat" activate C:\GaussianSplatting\envs\gaussian_splatting_cuda12
set PATH=C:\GaussianSplatting\envs\gaussian_splatting_cuda12\Scripts;%PATH%
set PYTHONPATH=C:\GaussianSplatting\gsplat;C:\GaussianSplatting\gsplat\examples;%PYTHONPATH%
set TORCH_EXTENSIONS_DIR=C:\WebApp\GaussianSplattingMaker\data\torch_extensions
set PYTHONUTF8=1
python -c "import gsplat; import gsplat.color_correct, gsplat.compression; print(gsplat.__file__); print('ok')"
