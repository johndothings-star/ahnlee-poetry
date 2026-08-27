@echo off
chcp 65001 >nul
setlocal EnableExtensions
pushd "%~dp0"

set "IMAGE_SOURCE=D:\GitHub\anh-tho"
set "BASE_PATH=/ahnlee-poetry/"
set "NODE_EXE="
set "EXIT_CODE=0"

for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not defined NODE_EXE (
  echo Khong tim thay Node.js. Hay cai Node.js 20 tro len roi chay lai.
  goto :failed
)

if not exist "%IMAGE_SOURCE%\" (
  echo Khong tim thay thu muc anh: %IMAGE_SOURCE%
  goto :failed
)

echo.
echo === THEM ANH THO ===
"%NODE_EXE%" "scripts\import-poem-images.mjs" "%IMAGE_SOURCE%"
if errorlevel 1 goto :failed

echo.
echo === BUILD WEBSITE ===
"%NODE_EXE%" "scripts\build.mjs"
if errorlevel 1 goto :failed

echo.
echo === CHAY TESTS ===
"%NODE_EXE%" --test "tests\site.test.mjs"
if errorlevel 1 goto :failed

echo.
echo Hoan tat. Hay mo GitHub Desktop de kiem tra, Commit va Push.
goto :finished

:failed
set "EXIT_CODE=1"
echo.
echo Co loi. Chua the hoan tat viec them anh.

:finished
echo.
if /i not "%THEM_ANH_THO_NO_PAUSE%"=="1" pause
popd
endlocal & exit /b %EXIT_CODE%
