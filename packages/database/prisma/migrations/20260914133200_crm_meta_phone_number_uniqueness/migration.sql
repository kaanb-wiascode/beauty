CREATE UNIQUE INDEX crm_message_provider_meta_phone_unique
ON crm_message_provider_connections((public_config->>'phoneNumberId'))
WHERE provider_key='meta-whatsapp' AND channel='WHATSAPP' AND enabled=TRUE;
