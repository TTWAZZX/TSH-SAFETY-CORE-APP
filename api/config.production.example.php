<?php
// Upload this file as api/config.local.php and set a strong JWT secret.
// config.local.php is intentionally excluded from Git.
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_user' => 'uattshpc_safetytsh',
    'db_pass' => 'SET_PRODUCTION_DB_PASSWORD',
    'db_name' => 'uattshpc_safetytsh',
    'db_ssl' => false,
    'jwt_secret' => 'SET_A_LONG_RANDOM_SECRET',
    'smtp_host' => 'smtp.gmail.com',
    'smtp_port' => 587,
    'smtp_secure' => false,
    'smtp_starttls' => true,
    'smtp_user' => 'safetytsh@gmail.com',
    'smtp_pass' => 'SET_GMAIL_APP_PASSWORD',
    'smtp_from' => 'safetytsh@gmail.com',
    'smtp_from_name' => 'TSH Safety Core',
];
