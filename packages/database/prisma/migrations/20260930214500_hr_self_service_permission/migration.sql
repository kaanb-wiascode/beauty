INSERT INTO permissions(id,resource,action,description)
SELECT gen_random_uuid()::text,'hr_self_service','read','Çalışanın kendi İK ve self servis alanlarına erişimi'
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE resource='hr_self_service' AND action='read'
);
