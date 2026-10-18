#!/usr/bin/env bash
set -e

BRANCH="${1:-final}"

echo "========================================================"
echo " [1/4] Обновление исходного кода из Git ($BRANCH)..."
echo "========================================================"
cd /var/www/zvuk
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
chmod -R 755 /var/www/zvuk

echo "========================================================"
echo " [2/4] Проверка и применение колонок PostgreSQL..."
echo "========================================================"
DB_ID=$(docker ps -qf "name=db" | head -n 1)
if [ -n "$DB_ID" ]; then
  docker exec "$DB_ID" psql -U track -d track -c "
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_admin_banned BOOLEAN DEFAULT FALSE NOT NULL;
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS admin_banned_by_user_id UUID;
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS admin_banned_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS duration DOUBLE PRECISION DEFAULT 0.0 NOT NULL;
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS normalized_signature VARCHAR(255);
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS license_type VARCHAR(100) DEFAULT 'CC / User Upload' NOT NULL;
    ALTER TABLE tracks ADD COLUMN IF NOT EXISTS dmca_reports_count INTEGER DEFAULT 0 NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT FALSE NOT NULL;
  " || true
fi

echo "========================================================"
echo " [3/4] Перезапуск zvuk-backend и Nginx..."
echo "========================================================"
docker restart zvuk-backend || true
systemctl restart nginx

echo "========================================================"
echo " [4/4] Статус бэкенда (последние логи):"
echo "========================================================"
sleep 2
docker logs --tail 20 zvuk-backend || true
echo "========================================================"
echo " Обновление успешно завершено!"
echo "========================================================"
