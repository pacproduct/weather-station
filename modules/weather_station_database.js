/**
 * Module saving and retrieving data from the weather station database.
 */

var sqlite3 = require("sqlite3");
var util = require('util');

/**
 * Constructor.
 * @param string databaseFile
 *   Filename of the file containing the database.
 * @param object|undefined options
 *   Object of parameters to apply to the instance. Structure:
 *   {
 *     // If true, more info would be outputed. Defaults to false.
 *     activateDebug: bool,
 *
 *     // Threshold that should make the retrieval of data switch to a per hour
 *     // average, in seconds. Defaults to 7 days (1 week).
 *     hourGranularityThreshold: int,
 *
 *     // Threshold that should make the retrieval of data switch to a per day
 *     // average, in seconds. Defaults to 31 days (approx. 1 month).
 *     dayGranularityThreshold: int
 *   }
 */
function WeatherStationDatabase(databaseFile, options) {
  /**
   * Constants.
   */
  // Emergency, system is unusable:
  this.WSDB_LOG_EMERGENCY = 0;
  // Alert, action must be taken immediately:
  this.WSDB_LOG_ALERT = 1;
  // Critical conditions:
  this.WSDB_LOG_CRITICAL = 2;
  // Error conditions:
  this.WSDB_LOG_ERROR = 3;
  // Warning conditions:
  this.WSDB_LOG_WARNING = 4;
  // Normal but significant conditions:
  this.WSDB_LOG_NOTICE = 5;
  // Informational messages:
  this.WSDB_LOG_INFO = 6;
  // Debug-level messages:
  this.WSDB_LOG_DEBUG = 7;

  // Number of seconds included in an entry of the PER HOUR table:
  this.WSDB_PER_HOUR_SECONDS = 3600;
  // Number of seconds included in an entry of the PER DAY table:
  this.WSDB_PER_DAY_SECONDS = 3600 * 24;

  this.databaseFile = databaseFile;
  this.db = new sqlite3.Database(this.databaseFile);

  // Options. See this function's docblock for more details.
  this.debug = options.activateDebug || false;
  this.hourGranularityThreshold = options.hourGranularityThreshold || 604800;
  this.dayGranularityThreshold = options.hourGranularityThreshold || 2678400;

  // Initialize database with tables if they do not exist yet:
  this.db.serialize(function() {
    // Logs table:
    this.run(
      "CREATE TABLE IF NOT EXISTS logs (" +
      "id INTEGER PRIMARY KEY, " +
      "timestamp INTEGER DEFAULT (strftime('%s', 'now')), " +
      "type INTEGER, " +
      "message TEXT" +
      ");"
    );

    // Column definition common to all data tables:
    var common_data_columns =
      "timestamp INTEGER DEFAULT (strftime('%s', 'now')) PRIMARY KEY, " +
      "temperature REAL, " +
      "humidity REAL";

    // Extra columns common to per_* tables:
    var common_per_columns = "," +
      "min_temperature REAL, " +
      "max_temperature REAL, " +
      "min_humidity REAL, " +
      "max_humidity REAL, " +
      "number_values INTEGER";

    // Weather raw data table:
    this.run("CREATE TABLE IF NOT EXISTS data_raw (" + common_data_columns + ");");
    // Weather data per hour table:
    this.run("CREATE TABLE IF NOT EXISTS data_per_hour (" + common_data_columns + common_per_columns + ");");
    // Weather data per day table:
    this.run("CREATE TABLE IF NOT EXISTS data_per_day (" + common_data_columns + common_per_columns + ");");
  });
}

/**
 * Saves a temperature and humidity in the database, timestamped with the
 * current date and time. Also pre-computes and saves corresponding per-hour and
 * per-day averages.
 * @param int|null timestamp
 *   Timestamp of the measure, in seconds. Set to null to default to the current
 *   timestamp.
 * @param float temperature
 *   Temperature to record.
 * @param float humidity
 *   Humidity to record.
 * @param function|undefined callback
 *   Function to call when the operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
WeatherStationDatabase.prototype.saveWeatherData = function(timestamp, temperature, humidity, callback) {
  var self = this;

  self.dbRun('BEGIN;', {}, function(err) {
    if (err) {
      self.log('Error while executing dbRun("BEGIN;"): ' + util.inspect(self.WSDB_LOG_ERROR), err);
    }

    // Insert in database:
    insertRawData(self, timestamp, temperature, humidity, function(err) {
      if (err) {
        self.log('Error while executing insertRawData(wsdb, ' + timestamp + ', ' + temperature + ', ' + humidity + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
      }

      // Insert/Update per HOUR averages:
      addAndUpdatePerHourAverages(self, timestamp, temperature, humidity, function(err) {
        if (err) {
          self.log('Error while executing addAndUpdatePerHourAverages(wsdb, ' + timestamp + ', ' + temperature + ', ' + humidity + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
        }

        // Insert/Update per DAY averages:
        addAndUpdatePerDayAverages(self, timestamp, temperature, humidity, function(err) {
          if (err) {
            self.log('Error while executing addAndUpdatePerDayAverages(wsdb, ' + timestamp + ', ' + temperature + ', ' + humidity + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
          }

          self.dbRun('COMMIT;', {}, callback);
        });
      });
    });
  });
};

/**
 * Removes a set of temperature and humidity from the database.
 * Also recomputes and saves corresponding per-hour and per-day averages.
 * @param int|null timestamp
 *   Timestamp of the measure to delete, in seconds.
 * @param function|undefined callback
 *   Function to call when the operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
WeatherStationDatabase.prototype.deleteWeatherData = function(timestamp, callback) {
  var self = this;

  self.dbRun('BEGIN;', {}, function(err) {
    if (err) {
      self.log('Error while executing dbRun("BEGIN;"): ' + util.inspect(self.WSDB_LOG_ERROR), err);
    }

    // Insert in database:
    deleteRawData(self, timestamp, function(err) {
      if (err) {
        self.log('Error while executing deleteRawData(wsdb, ' + timestamp + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
      }

      // Delete/Update per HOUR averages:
      deleteAndUpdateAverages(self, 'data_per_hour', timestamp, function(err) {
        if (err) {
          self.log('Error while executing deleteAndUpdateAverages(wsdb, "data_per_hour", ' + timestamp + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
        }

        // Delete/Update per DAY averages:
        deleteAndUpdateAverages(self, 'data_per_day', timestamp, function(err) {
          if (err) {
            self.log('Error while executing deleteAndUpdateAverages(wsdb, "data_per_day", ' + timestamp + ', callback): ' + util.inspect(self.WSDB_LOG_ERROR), err);
          }

          self.dbRun('COMMIT;', {}, callback);
        });
      });
    });
  });
};

/**
 * Retrieves a set of temperature & humidity data for the given timeframe.
 * @param int timestamp_start
 *   Beginning of the timeframe to retrieve, as a timestamp in seconds.
 *   Is included in the returned data.
 * @param int timestamp_end
 *   End of the timeframe to retrieve, as a timestamp in seconds.
 *   Is excluded from the returned data.
 * @param string|null granularity
 *   Granularity of the data to return. Valid values:
 *   'raw':  Will return all available pieces of data within the timeframe.
 *   'hour': Returns averages, min & max values per hour.
 *   'day':  Returns averages, min & max values per day.
 *   null:   Automatically decides what granularity to apply, depending on the
 *           asked timeframe. This can be configured, see constructor.
 *           (Any invalid value would be interpreted as null).
 * @param function callback
 *   Function to call when the operation is complete. Signature:
 *   function(err, data) where:
 *   - err contains the error object if something went wrong. Null otherwise.
 *   - data contains an object structured as follows:
 *   {
 *     timestamp_start: int (in seconds),
 *     timestamp_end: int (in seconds),
 *     granularity: string (See what the granularity parameter can take above),
 *     data: [
 *       {
 *         timestamp: int (in seconds),
 *         temperature: float,
 *         humidity: float,
 *         min_temperature: float, *
 *         max_temperature: float, *
 *         min_humidity: float, *
 *         max_humidity: float, *
 *         number_values: int, *
 *       },
 *       ...
 *     ]
 *   }
 *   Important: Depending on which table was queried, all elements flagged with
 *   a star (*) above MAY or MAY NOT be returned. In fact, they would always be
 *   returned, except when the granularity was set (or automatically selected)
 *   to 'raw'.
 *   Important2: If an error occurred, data would be null.
 */
WeatherStationDatabase.prototype.getWeatherData = function(timestamp_start, timestamp_end, granularity, callback) {
  var nw = null;

  // DEBUG:
  if (this.debug) {
    nw = new Date();
    console.log(nw.toISOString() + ': ' + 'wsdb.getWeatherData(): Given granularity: "' + granularity + '" / Given timeframe: ' + (timestamp_end - timestamp_start) + '.');
  }
  // DEBUG.

  // Figure out what granularity to use:
  var data_table = null;
  switch (granularity) {
    case 'raw':
      data_table = 'data_raw';
      break;

    case 'hour':
      data_table = 'data_per_hour';
      break;

    case 'day':
      data_table = 'data_per_day';
      break;

    // If no granularity or valid granularity was given, automatically choose
    // one in step with given timeframe:
    default:
      var timeframe = timestamp_end - timestamp_start;

      if (timeframe > this.dayGranularityThreshold) {
        data_table = 'data_per_day';
        granularity = 'day';
      }
      else if (timeframe > this.hourGranularityThreshold) {
        data_table = 'data_per_hour';
        granularity = 'hour';
      }
      else {
        data_table = 'data_raw';
        granularity = 'raw';
      }
      break;
  }

  // DEBUG:
  if (this.debug) {
    nw = new Date();
    console.log(nw.toISOString() + ': ' + 'wsdb.getWeatherData(): Granularity "' + granularity + '" selected.');
  }
  // DEBUG.

  // Prepare list of columns to select:
  var columns = 'timestamp, temperature, humidity';
  if (data_table != 'data_raw') {
    columns = columns + ', min_temperature, max_temperature, min_humidity, max_humidity, number_values';
  }

  // Query the database:
  var self = this;
  this.dbAll(
    'SELECT ' + columns + ' FROM ' + data_table + ' WHERE timestamp >= $t_start AND timestamp < $t_end ORDER BY timestamp;',
    {$t_start: timestamp_start, $t_end: timestamp_end},
    function(err, rows) {
      var nw = null;

      if (err) {
        wsdb.log('Error while executing getWeatherData(' + timestamp_start + ', ' + timestamp_end + ', "' + granularity + '", callback), when trying to run the SELECT query: ' + util.inspect(self.WSDB_LOG_ERROR), err);
        callback(err, null);
      }
      else {
        // DEBUG:
        if (self.debug) {
          nw = new Date();
          console.log(nw.toISOString() + ': ' + 'wsdb.getWeatherData(): Returned ' + rows.length + ' items.');
        }
        // DEBUG.

        callback(
          null,
          {
            timestamp_start: timestamp_start,
            timestamp_end: timestamp_end,
            granularity: granularity,
            data: rows
          }
        );
      }
    }
  );
};

/**
 * Records a log message in the database.
 * @param int type
 *   Message type. Should be one the defined constants at the top of this file.
 * @param mixed message
 *   Log message. If string given, will be stored as is. Otherwise, will
 *   attempt to apply util.inspect() on it to save a representation of the
 *   given object.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, undefined otherwise.
 *   Optional. If none provided, nothing will happen even if an error occurred.
 *   This special behavior is there to ensure logging never makes the server
 *   fail.
 */
WeatherStationDatabase.prototype.log = function(type, message, callback) {
  var nw = new Date();

  if (!(typeof message == 'string' || message instanceof String)) {
    // If given message is not a string (e.g. an object), inspect it instead:
    message = util.inspect(message);
  }

  // DEBUG:
  if (this.debug) {
    console.log(nw.toISOString() + ': ' + 'WeatherStationDatabase.prototype.log() called:');
    console.log(message);
    console.trace();
  }
  // DEBUG.

  this.dbRun(
    "INSERT INTO logs(type, message) VALUES ($t, $m);",
    {$t: type, $m: message},
    // Make sure no exception is thrown if an error occurs by passing in
    // a callback:
    function(err) {
      // If an error occurred:
      if (err) {
        if (callback) {
          // A callback was provided, return the error to the callback:
          callback(err);
        }
        else {
          // No callback was provided, just log to the STDERR something went
          // wrong:
          console.error(nw.toISOString() + ': ' + 'WeatherStationDatabase.prototype.log() failed at logging the following message:');
          console.error(message);
        }
      }
      // No error occurred and a callback was provided, call with no parameter:
      else if (callback) {
        callback(undefined);
      }
    }
  );
};

/**
 * Wrapper of the sqlite3 database.run() function.
 */
WeatherStationDatabase.prototype.dbRun = function(sql, param, callback) {
  var self = this;

  this.db.run(sql, param, function(err) {
    // DEBUG:
    if (self.debug) {
      console.log('>> EXECUTED: [' + sql + '] with:');
      console.log(param);
    }
    // DEBUG.

    if (callback) {
      callback(err);
    }
  });
};

/**
 * Wrapper of the sqlite3 database.get() function.
 */
WeatherStationDatabase.prototype.dbGet = function(sql, param, callback) {
  var self = this;

  this.db.get(sql, param, function(err, row) {
    // DEBUG:
    if (self.debug) {
      console.log('>> EXECUTED: [' + sql + '] with:');
      console.log(param);
    }
    // DEBUG.

    if (callback) {
      callback(err, row);
    }
  });
};

/**
 * Wrapper of the sqlite3 database.all() function.
 */
WeatherStationDatabase.prototype.dbAll = function(sql, param, callback) {
  var self = this;

  this.db.all(sql, param, function(err, rows) {
    // DEBUG:
    if (self.debug) {
      console.log('>> EXECUTED: [' + sql + '] with:');
      console.log(param);
    }
    // DEBUG.

    if (callback) {
      callback(err, rows);
    }
  });
};

/**
 * Inserts a pair temperature+humidity in the database (raw table only).
 * @param WheatStationDatabase wsdb
 *   WheatStationDatabase's instance context.
 * @param int|null timestamp
 *   Timestamp of the measure, in seconds. Set to null to default to the current
 *   timestamp.
 * @param float temperature
 *   Temperature to insert.
 * @param float humidity
 *   Humidity to insert.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
function insertRawData(wsdb, timestamp, temperature, humidity, callback) {
  // If timestamp is null, initialize it:
  if (timestamp === null) {
    timestamp = Math.round(Date.now() / 1000);
  }

  wsdb.dbRun(
    "INSERT INTO data_raw(timestamp, temperature, humidity) VALUES ($ts, $t, $h);",
    {$ts: timestamp, $t: temperature, $h: humidity},
    callback
  );
}

/**
 * Removes a pair temperature+humidity from the database (raw table only).
 * @param WheatStationDatabase wsdb
 *   WheatStationDatabase's instance context.
 * @param int timestamp
 *   Timestamp of the measure to delete, in seconds.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
function deleteRawData(wsdb, timestamp, callback) {
  wsdb.dbRun(
    "DELETE FROM data_raw WHERE timestamp = $ts;",
    {$ts: timestamp},
    callback
  );
}

/**
 * Insert given temperature+humidity to the average and min/max 'PER HOUR' table
 * in the database.
 * @param WheatStationDatabase wsdb
 *   WheatStationDatabase's instance context.
 * @param int|null timestamp
 *   Timestamp of the measure, in seconds. Set to null to default to the current
 *   timestamp.
 * @param float temperature
 *   Temperature to take into account to adjust the average and min/max.
 * @param float humidity
 *   Humidity to take into account to adjust the average and min/max.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
function addAndUpdatePerHourAverages(wsdb, timestamp, temperature, humidity, callback) {
  // If timestamp is null, initialize it to now:
  if (timestamp === null) {
    timestamp = Math.round(Date.now() / 1000);
  }

  addAndUpdateAverages(
    wsdb,
    'data_per_hour',
    timestampFromPattern(timestamp, '%Y-%M-%d-%H-00-00'),
    temperature,
    humidity,
    callback
  );
}

/**
 * Same as addAndUpdatePerHourAverages(), but for the 'PER DAY' table.
 */
function addAndUpdatePerDayAverages(wsdb, timestamp, temperature, humidity, callback) {
  // If timestamp is null, initialize it to now:
  if (timestamp === null) {
    timestamp = Math.round(Date.now() / 1000);
  }

  addAndUpdateAverages(
    wsdb,
    'data_per_day',
    timestampFromPattern(timestamp, '%Y-%M-%d-00-00-00'),
    temperature,
    humidity,
    callback
  );
}

/**
 * Helper converting given timestamp to its rounded up version, in step with
 * given date pattern. Example:
 * If you give a timestamp a,d the following pattern: '%Y-%M-%d-12-00-00', this
 * function would return the timestamp corresponding to given timestamp's day,
 * at 12 o'clock.
 *
 * @param int|null timestamp
 *   Source timestamp in seconds. Set to null to default to the current
 *   timestamp.
 * @param string pattern
 *   Pattern to apply. See formatDate() for accepted tokens.
 *   Should follow this form: '%Y-%M-%d-%H-%m-%s'. Example: '%Y-%M-%d-12-00-00'.
 * @return int
 *   A timestamp in seconds, representing the date computed from the pattern.
 */
function timestampFromPattern(timestamp, pattern) {
  // If timestamp is null, initialize it to now:
  if (timestamp === null) {
    timestamp = Math.round(Date.now() / 1000);
  }

  var formatted_date = formatDate(timestamp, pattern);
  var bits = formatted_date.split('-');

  // If any bit is missing, set it to its logical default value:
  // Month.
  bits[1] = bits[1] || 0;
  // Day.
  bits[2] = bits[2] || 1;
  // Hour.
  bits[3] = bits[3] || 0;
  // Minute.
  bits[4] = bits[4] || 0;
  // Second.
  bits[5] = bits[5] || 0;

  var date = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2], bits[3], bits[4], bits[5]));

  return Math.round(date.getTime() / 1000);
}

/**
 * Updates averages and min/max values for given timestamp and a pair
 * temperature+humidity to ADD into the database.
 * @param WheatStationDatabase wsdb
 *   WheatStationDatabase's instance context.
 * @param string tableName
 *   Name of the table the data will be saved to.
 * @param int timestamp
 *   Timestamp in seconds corresponding to the entry holding averages and
 *   min/max to update in the database.
 * @param float temperature
 *   Temperature to apply to the average & min/max entry.
 * @param float humidity
 *   Humidity to apply to the average & min/max entry.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
function addAndUpdateAverages(wsdb, tableName, timestamp, temperature, humidity, callback) {
  // Retrieve current average for given timestamp:
  wsdb.dbGet(
    "SELECT timestamp, temperature, humidity, min_temperature, max_temperature, min_humidity, max_humidity, number_values " +
    "FROM " + tableName + " WHERE timestamp = $ts;",
    {$ts: timestamp},
    function(err, row) {
      if (err) {
        wsdb.log('Error while executing addAndUpdateAverages(wsdb, "' + tableName + '", ' + timestamp + ', ' + temperature + ', ' + humidity + ', callback), when trying to run the SELECT query: ' + util.inspect(self.WSDB_LOG_ERROR), err);
      }
      else {
        // If no data found, insert a new row:
        if (row === undefined) {
          wsdb.dbRun(
            "INSERT INTO " + tableName + "(timestamp, temperature, humidity, min_temperature, max_temperature, min_humidity, max_humidity, number_values) " +
            "VALUES ($ts, $t, $h, $min_t, $max_t, $min_h, $max_h, $num_values);",
            {
              $ts: timestamp,
              $t: temperature,
              $h: humidity,
              $min_t: temperature,
              $max_t: temperature,
              $min_h: humidity,
              $max_h: humidity,
              $num_values: 1
            },
            callback
          );
        }
        // If existing data found, update it:
        else {
          // Prepare new values:
          var new_number_values = row.number_values + 1;

          var new_temperature = row.temperature + (temperature - row.temperature) / new_number_values;
          var new_humidity = row.humidity + (humidity - row.humidity) / new_number_values;

          var new_min_temperature = row.min_temperature;
          if (temperature < row.min_temperature) {
            new_min_temperature = temperature;
          }

          var new_max_temperature = row.max_temperature;
          if (temperature > row.max_temperature) {
            new_max_temperature = temperature;
          }

          var new_min_humidity = row.min_humidity;
          if (humidity < row.min_humidity) {
            new_min_humidity = humidity;
          }

          var new_max_humidity = row.max_humidity;
          if (humidity > row.max_humidity) {
            new_max_humidity = humidity;
          }

          wsdb.dbRun(
            "UPDATE " + tableName + " " +
            "SET temperature = $t, humidity = $h, min_temperature = $min_t, max_temperature = $max_t, " +
            "min_humidity = $min_h, max_humidity = $max_h, number_values = $num_values " +
            "WHERE timestamp = $ts;",
            {
              $t: new_temperature,
              $h: new_humidity,
              $min_t: new_min_temperature,
              $max_t: new_max_temperature,
              $min_h: new_min_humidity,
              $max_h: new_max_humidity,
              $num_values: new_number_values,
              $ts: timestamp
            },
            callback
          );
        }
      }
    }
  );
}

/**
 * Updates averages and min/max values for given timestamp and a pair
 * temperature+humidity to DELETE from the database.
 * @param WheatStationDatabase wsdb
 *   WheatStationDatabase's instance context.
 * @param string tableName
 *   Name of the table the data will be saved to.
 * @param int timestamp
 *   Timestamp in seconds corresponding to the entry holding averages and
 *   min/max to update in the database.
 * @param function|undefined callback
 *   Function to call when the insert operation is complete. Signature:
 *   function(err) where err is the error if any occurred, null otherwise.
 *   Optional. If none provided, an error will be raised if one occurred.
 */
function deleteAndUpdateAverages(wsdb, tableName, timestamp, callback) {
  var timeframe = 0;
  var time_pattern = '';

  // Choose the number of seconds that averages will cover.
  switch(tableName) {
    case 'data_per_hour':
      timeframe = wsdb.WSDB_PER_HOUR_SECONDS;
      time_pattern = '%Y-%M-%d-%H-00-00';
      break;
    case 'data_per_day':
      timeframe = wsdb.WSDB_PER_DAY_SECONDS;
      time_pattern = '%Y-%M-%d-00-00-00';
      break;
    // The default case should never happen.
    default:
      callback(null);
      return;
  }

  var timestamp_start = timestampFromPattern(timestamp, time_pattern);

  // DEBUG:
  if (wsdb.debug) {
    nw = new Date();
    console.log(nw.toISOString() + ': ' + 'deleteAndUpdateAverages(wsdb, "' + tableName + '", ' + timestamp + ', callback)');
    console.log('  >> timeframe: ' + timeframe);
    console.log('  >> timestamp_start: ' + timestamp_start);
    console.log('  >> time_pattern: ' + time_pattern);
  }
  // DEBUG.

  // Delete current average for given timestamp:
  wsdb.dbRun(
    "DELETE FROM " + tableName + " WHERE timestamp = $ts;",
    {$ts: timestamp_start},
    function(err) {
      if (err) {
        wsdb.log('Error while executing deleteAndUpdateAverages(wsdb, "' + tableName + '", ' + timestamp + ', callback), when trying to run the DELETE query: ' + util.inspect(self.WSDB_LOG_ERROR), err);
      }
      else {
        // Recompute the complete set of values.
        // Collect all values that will be used to recompute values:
        wsdb.getWeatherData(timestamp_start, timestamp_start + timeframe, 'raw', function(err, data) {
          var rows = data.data;

          // DEBUG:
          if (wsdb.debug) {
            console.log('  >> Number of rows to be processed: ' + rows.length);
          }
          // DEBUG.

          if (err) {
            callback(err);
          }
          else {
            // Loop over data and reconstruct averages:
            var len = rows.length;
            var averages = null;
            for(var i = 0; i < len; i++){
              if (averages === null) {
                averages = {
                  nb: 1,
                  temperature: rows[i].temperature,
                  humidity: rows[i].humidity,
                  min_temperature: rows[i].temperature,
                  max_temperature: rows[i].temperature,
                  min_humidity: rows[i].humidity,
                  max_humidity: rows[i].humidity
                };
              }
              else {
                averages.nb++;
                averages.temperature = averages.temperature + (rows[i].temperature - averages.temperature) / averages.nb;
                averages.humidity = averages.humidity + (rows[i].humidity - averages.humidity) / averages.nb;

                if (rows[i].temperature < averages.min_temperature) {
                  averages.min_temperature = rows[i].temperature;
                }

                if (rows[i].temperature > averages.max_temperature) {
                  averages.max_temperature = rows[i].temperature;
                }

                if (rows[i].humidity < averages.min_humidity) {
                  averages.min_humidity = rows[i].humidity;
                }

                if (rows[i].humidity > averages.max_humidity) {
                  averages.max_humidity = rows[i].humidity;
                }
              }
            }

            // Insert results in database if any:
            if (averages !== null) {
              wsdb.dbRun(
                "INSERT INTO " + tableName + "(timestamp, temperature, humidity, min_temperature, max_temperature, min_humidity, max_humidity, number_values) " +
                "VALUES ($ts, $t, $h, $min_t, $max_t, $min_h, $max_h, $num_values);",
                {
                  $ts: timestamp_start,
                  $t: averages.temperature,
                  $h: averages.humidity,
                  $min_t: averages.min_temperature,
                  $max_t: averages.max_temperature,
                  $min_h: averages.min_humidity,
                  $max_h: averages.max_humidity,
                  $num_values: averages.nb
                },
                callback
              );
            }
            // No result? Do nothing.
            else {
              callback(null);
            }
          }
        });
      }
    }
  );
}

/**
 * Formats given timestamp to a string in step with given format pattern.
 * @param int timestamp
 *   Timestamp in seconds.
 * @param string format
 *   Pattern used to format the timestamp. Possible tokens:
 *   %Y: Year on 4 digits.
 *   %M: Month on 2 digits (01-12).
 *   %d: Day on 2 digits (01-31).
 *   %H: Hour on 2 digits (00-24).
 *   %m: Minute on 2 digits (00-59).
 *   %s: Second on 2 digits (00-59).
 * @returns string
 *   Timestamp formatted as a string.
 *
 * @throws Error
 *   If an invalid token is passed.
 */
function formatDate(timestamp, format) {
  var date = new Date(timestamp * 1000);

  function pad(value) {
    return (value.toString().length < 2) ? '0' + value : value;
  }

  return format.replace(/%([a-zA-Z])/g, function (_, fmtCode) {
    switch (fmtCode) {
      case 'Y':
        return date.getUTCFullYear();
      case 'M':
        return pad(date.getUTCMonth() + 1);
      case 'd':
         return pad(date.getUTCDate());
      case 'H':
        return pad(date.getUTCHours());
      case 'm':
        return pad(date.getUTCMinutes());
      case 's':
        return pad(date.getUTCSeconds());
      default:
        throw new Error('Unsupported format code: ' + fmtCode);
    }
  });
}




// Export module:
module.exports = WeatherStationDatabase;
