BEGIN;

-- Rename old tables --

ALTER TABLE logs RENAME TO tmp_logs;
ALTER TABLE data_raw RENAME TO tmp_data_raw;
ALTER TABLE data_per_hour RENAME TO tmp_data_per_hour;
ALTER TABLE data_per_day RENAME TO tmp_data_per_day;

-- Create new tables --

CREATE TABLE logs (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  type INTEGER,
  message TEXT
  );

CREATE TABLE data_raw (
  timestamp INTEGER DEFAULT (strftime('%s', 'now')) PRIMARY KEY,
  temperature REAL,
  humidity REAL
  );

CREATE TABLE data_per_hour (
  timestamp INTEGER DEFAULT (strftime('%s', 'now')) PRIMARY KEY,
  temperature REAL,
  humidity REAL,
  min_temperature REAL,
  max_temperature REAL,
  min_humidity REAL,
  max_humidity REAL,
  number_values INTEGER
  );

CREATE TABLE data_per_day (
  timestamp INTEGER DEFAULT (strftime('%s', 'now')) PRIMARY KEY,
  temperature REAL,
  humidity REAL,
  min_temperature REAL,
  max_temperature REAL,
  min_humidity REAL,
  max_humidity REAL,
  number_values INTEGER
  );

-- Transfer old data to new tables --

INSERT INTO logs(timestamp, type, message)
  SELECT timestamp, type, message
  FROM tmp_logs;
  
INSERT INTO data_raw(timestamp, temperature, humidity)
  SELECT timestamp, temperature, humidity
  FROM tmp_data_raw;

INSERT INTO data_per_hour(
    timestamp, temperature, humidity, min_temperature, max_temperature,
    min_humidity, max_humidity, number_values)
  SELECT timestamp, temperature, humidity, min_temperature, max_temperature,
    min_humidity, max_humidity, number_values
  FROM tmp_data_per_hour;
  
INSERT INTO data_per_day(
    timestamp, temperature, humidity, min_temperature, max_temperature,
    min_humidity, max_humidity, number_values)
  SELECT timestamp, temperature, humidity, min_temperature, max_temperature,
    min_humidity, max_humidity, number_values
  FROM tmp_data_per_day;
  
-- Delete old tables --

DROP TABLE tmp_logs;
DROP TABLE tmp_data_raw;
DROP TABLE tmp_data_per_hour;
DROP TABLE tmp_data_per_day;

COMMIT;
VACUUM;
