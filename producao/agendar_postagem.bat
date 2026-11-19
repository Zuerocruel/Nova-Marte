@echo off
chcp 65001 >nul
setlocal
REM =====================================================================
REM  Cria (ou remove) a tarefa do Agendador de Tarefas do Windows que posta
REM  no Instagram e no TikTok pelo celular:  postar_avulso.py --celular
REM
REM    agendar_postagem.bat               cria a tarefa diária às 19:00
REM    agendar_postagem.bat 18:30         cria às 18:30
REM    agendar_postagem.bat remover       apaga a tarefa
REM    agendar_postagem.bat testar        roda agora, em modo ENSAIO (não publica)
REM
REM  A tarefa só roda com você logado no Windows (o ADB precisa da sua sessão),
REM  o celular conectado no USB e desbloqueado. Ela só posta episódios APROVADOS
REM  no painel e nunca reposta o que estiver publicado ou "conferir".
REM =====================================================================
set "TAREFA=OperacaoMarteZero\PostarCelular"
set "PASTA=%~dp0"
for /f "delims=" %%P in ('where python 2^>nul') do if not defined PY set "PY=%%P"
if not defined PY (
  echo Python nao encontrado no PATH.
  exit /b 1
)

if /i "%~1"=="remover" (
  schtasks /Delete /TN "%TAREFA%" /F
  exit /b %errorlevel%
)
if /i "%~1"=="testar" (
  "%PY%" "%PASTA%postar_avulso.py" --celular --ensaio
  exit /b %errorlevel%
)

set "HORA=%~1"
if not defined HORA set "HORA=19:00"
schtasks /Create /TN "%TAREFA%" /SC DAILY /ST %HORA% /F ^
  /TR "\"%PY%\" \"%PASTA%postar_avulso.py\" --celular"
if errorlevel 1 exit /b 1
echo.
echo Tarefa "%TAREFA%" criada: todo dia as %HORA%.
echo Logs: %PASTA%dados\logs\
echo Para ver/editar: taskschd.msc   ^|   Para apagar: agendar_postagem.bat remover
endlocal
