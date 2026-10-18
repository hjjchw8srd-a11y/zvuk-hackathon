@echo off
chcp 65001 >nul
echo ========================================================
echo  Обновление сайта на удаленном сервере (31.77.174.168)
echo ========================================================
echo.
echo Введите пароль от root@31.77.174.168 при запросе:
echo.
ssh root@31.77.174.168 "cd /var/www/zvuk && git fetch origin project-db && git reset --hard origin/project-db && chmod -R 755 /var/www/zvuk && systemctl restart nginx && docker restart zvuk-backend"
echo.
echo ========================================================
echo  Обновление завершено! Обновите страницу (Ctrl+F5)
echo ========================================================
pause
