-- Las dos bases existen únicamente dentro del contenedor temporal de pruebas.
CREATE DATABASE banco_talentos_e2e_testing;
\connect banco_talentos_e2e_testing
CREATE EXTENSION IF NOT EXISTS postgis;
