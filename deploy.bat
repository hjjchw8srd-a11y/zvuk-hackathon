@echo off
chcp 65001 >nul
echo ========================================================
echo  Обновление сайта на удаленном сервере (31.77.174.168)
echo  Ветка: final
echo ========================================================
echo.
echo Введите пароль от root@31.77.174.168 при запросе:
echo.
ssh -t root@31.77.174.168 "cd /var/www/zvuk && (git fetch origin final 2>/dev/null || git fetch upstream final 2>/dev/null || git fetch --all) && (git reset --hard origin/final 2>/dev/null || git reset --hard upstream/final 2>/dev/null || git reset --hard final) && chmod -R 755 /var/www/zvuk && chmod +x deploy.sh && ./deploy.sh final"
echo.
echo ========================================================
echo  Обновление завершено! Обновите страницу (Ctrl+F5)
echo ========================================================
pause
