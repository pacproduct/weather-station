/**
 * Converter from data files to sqlite3 database format.
 */

//Core and contribution modules:
var fs = require('fs');

/**
 * Computes the folder path where the file storing weather data for given date
 * should be.
 *
 * @param Date date
 *   Date object.
 *
 * @return string
 *   Folder path where the corresponding weather data should be stored.
 */
function getWeatherDataFolderPath(date) {
  return './data/' + date.getUTCFullYear();
}

/**
 * Computes the filename of the file storing weather data for given date.
 *
 * @param Date date
 *   Date object.
 *
 * @return string
 *   Filename where the corresponding weather data should be stored.
 */
function getWeatherDataFilename(date) {
  return date.getUTCFullYear() + '-' + (date.getUTCMonth()+1) + '-' + date.getUTCDate() + '.csv';
}

/**
 * Retrieves a range of weather data from a file.
 * Warning: Synchronous function :/
 *
 * @param string filePath
 *   Path to the data file to parse.
 *
 * @param Number startTS
 *   Timestamp: Range start (milliseconds).
 *
 * @param Number endTS
 *   Timestamp: Range end (milliseconds).
 *
 * @return array
 *   Array of weather data (within given range) structured like this:
 *   [
 *     [Int timestamp (milliseconds), Float temperature, Float humidity],
 *     [Int timestamp (milliseconds), Float temperature, Float humidity],
 *     ...
 *   ]
 *
 *   Note: temperature and/or humidity can be null.
 */
function retrieveWeatherDataFromFile(filePath, startTS, endTS) {
  var data = [];

  // If file doesn't exist, just return an empty array right away:
  if (!fs.existsSync(filePath)) {
    return data;
  }

  // Parse data file and retrieve what's within given range:
  fs.readFileSync(filePath).toString().split('\n').forEach(function (line) {
    // Split line's data:
    var line_data = line.split(';');
    if (line_data.length >= 3) {
      var line_timestamp = parseInt(line_data[0], 10) * 1000;

      if (line_timestamp >= startTS && line_timestamp < endTS) {
        var line_temperature = line_data[1];
        var line_humidity = line_data[2];

        if (line_temperature == 'null') {
          line_temperature = null;
        }
        else {
          line_temperature = parseFloat(line_temperature);
        }

        if (line_humidity == 'null') {
          line_humidity = null;
        }
        else {
          line_humidity = parseFloat(line_humidity);
        }

        // Push retrieved data in our array:
        data.push([line_timestamp, line_temperature, line_humidity]);
      }
    }
  });

  return data;
}

/**
 * Retrieves a range of weather data from the database.
 * Warning: Synchronous function :/
 *
 * @param Number startTS
 *   Timestamp: Range start (milliseconds).
 *
 * @param Number endTS
 *   Timestamp: Range end (milliseconds).
 *
 * @return array
 *   Array of weather data (within given range) structured like what returns
 *   retrieveWeatherDataFromFile().
 */
function retrieveWeatherDataFromDB(startTS, endTS) {
  var data = [];
  var retrievalComplete = false;

  var currentDate = new Date(startTS);

  while(!retrievalComplete) {
    currentFolder = getWeatherDataFolderPath(currentDate);
    currentFile = getWeatherDataFilename(currentDate);

    // Parse current data file and retrieve what's within given range:
    data = data.concat(retrieveWeatherDataFromFile(currentFolder + '/' + currentFile, startTS, endTS));

    // Go to next day:
    currentDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1));

    // If current day is now greater than endTS, we're done:
    var currentTS = currentDate.getTime();
    if (currentTS >= endTS) {
      retrievalComplete = true;
    }
  }

  return data;
}

function formatDate(timestamp, fmt) {
  var date = new Date(timestamp * 1000);

  function pad(value) {
      return (value.toString().length < 2) ? '0' + value : value;
  }
  return fmt.replace(/%([a-zA-Z])/g, function (_, fmtCode) {
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





















// -- CONVERSION SECTION --

console.log("Loading items from files...");

var data = retrieveWeatherDataFromDB(1388534400000, Date.now());
var len = data.length;

console.log(len + " items were loaded in memory.");

console.log("Preparing data...");

var file = "data.db";

var sqlite3 = require("sqlite3");
var db = new sqlite3.Database(file);
var num_inserted = 0;

// Initializations
db.serialize(function() {
  // Logs table:
  db.run(
    "CREATE TABLE IF NOT EXISTS logs (" +
    "timestamp INTEGER DEFAULT CURRENT_TIMESTAMP PRIMARY KEY," +
    "type INTEGER," +
    "message TEXT" +
    ");"
  );

  // Column definition common to all data tables:
  var common_data_columns =
    "timestamp INTEGER DEFAULT CURRENT_TIMESTAMP PRIMARY KEY," +
    "temperature REAL," +
    "humidity REAL";

  // Extra columns common to per_* tables:
  var common_per_columns = "," +
    "min_temperature REAL," +
    "max_temperature REAL," +
    "min_humidity REAL," +
    "max_humidity REAL," +
    "number_values INTEGER";

  // Weather raw data table:
  db.run("CREATE TABLE IF NOT EXISTS data_raw (" + common_data_columns + ");");
  // Weather data per hour table:
  db.run("CREATE TABLE IF NOT EXISTS data_per_hour (" + common_data_columns + common_per_columns + ");");
  // Weather data per day table:
  db.run("CREATE TABLE IF NOT EXISTS data_per_day (" + common_data_columns + common_per_columns + ");", insert_raw);
});

// -- IMPORT DATA --
function insert_raw(err) {
  if (err) {
    console.log(err);
    process.exit();
  }

  console.log("Inserting RAW data...");

  var previous_timestamp = 0;

  db.run("BEGIN TRANSACTION");
  for (var i = 0; i < len; i++) {
    // If current timestamp < previous one, skip this entry:
    if (data[i][0] / 1000 > previous_timestamp) {
      db.run(
        'INSERT INTO data_raw(timestamp, temperature, humidity) VALUES ($d, $t, $h)',
        {
          $d: data[i][0] / 1000,
          $t: data[i][1],
          $h: data[i][2]
        }
      );

      previous_timestamp = data[i][0] / 1000;
      num_inserted++;
    }
    else {
      console.log("  >> Skipping entry " + i + " with timestamp " + data[i][0] / 1000 + " older than previous one: " + previous_timestamp);
    }
  }
  db.run("END", function(err) {
    if (err) {
      console.log(err);
      process.exit();
    }

    // Insert element per hour:
    insert_grouped_by_pattern('%Y-%M-%d-%H', 'data_per_hour', function() {
      // Insert element per day:
      insert_grouped_by_pattern('%Y-%M-%d-00', 'data_per_day', end);
    });
  });
}

function insert_grouped_by_pattern(pattern, table_name, callback) {
  console.log("Preparing '" + pattern + "' data...");

  // Retrieve all entries:
  db.all("SELECT * FROM data_raw;", function(err, rows) {
    if (err) {
      console.log(err);
      process.exit();
    }
    else if (rows) {
      db.run("BEGIN TRANSACTION");

      var len = rows.length;
      var averages = [];
      var averages_len = 0;
      for(var i = 0; i < len; i++){
        // Compute current index based on given time pattern:
        var current_hour = formatDate(rows[i].timestamp, pattern);
        var bits = current_hour.split('-');
        var date = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2], bits[3]));
        var current_hour_timestamp = date.getTime() / 1000;
        if (current_hour in averages) {
          averages[current_hour].nb++;
          averages[current_hour].temperature = averages[current_hour].temperature + rows[i].temperature;
          averages[current_hour].humidity = averages[current_hour].humidity + rows[i].humidity;

          if (rows[i].temperature < averages[current_hour].min_temperature) {
            averages[current_hour].min_temperature = rows[i].temperature;
          }

          if (rows[i].temperature > averages[current_hour].max_temperature) {
            averages[current_hour].max_temperature = rows[i].temperature;
          }

          if (rows[i].humidity < averages[current_hour].min_humidity) {
            averages[current_hour].min_humidity = rows[i].humidity;
          }

          if (rows[i].humidity > averages[current_hour].max_humidity) {
            averages[current_hour].max_humidity = rows[i].humidity;
          }
        }
        else {
          averages[current_hour] = {
            nb: 1,
            timestamp: current_hour_timestamp,
            temperature: rows[i].temperature,
            humidity: rows[i].humidity,
            min_temperature: rows[i].temperature,
            max_temperature: rows[i].temperature,
            min_humidity: rows[i].humidity,
            max_humidity: rows[i].humidity
          };

          averages_len++;
        }
      }

      console.log(averages_len + " items to insert. In progress...");

      // Prepare averages and insert them:
      for (var key in averages) {
        if (averages.hasOwnProperty(key)) {
          averages[key].temperature = averages[key].temperature / averages[key].nb;
          averages[key].humidity = averages[key].humidity / averages[key].nb;

          db.run(
            'INSERT INTO ' + table_name + '(timestamp, temperature, humidity, min_temperature, max_temperature, min_humidity, max_humidity, number_values) ' +
            'VALUES ($d, $t, $h, $min_t, $max_t, $min_h, $max_h, $nb)',
            {
              $d: averages[key].timestamp,
              $t: averages[key].temperature,
              $h: averages[key].humidity,
              $min_t: averages[key].min_temperature,
              $max_t: averages[key].max_temperature,
              $min_h: averages[key].min_humidity,
              $max_h: averages[key].max_humidity,
              $nb: averages[key].nb
            }
          );
        }
      }

      db.run("END", callback);
    }
    else {
      console.log("Table data_raw was empty! Aborting.");
      process.exit();
    }
  });
}

// -- End of process --
function end() {
  console.log('----');
  console.log(num_inserted + " items were imported.");
  console.log((len - num_inserted) + " items were skipped.");
  console.log('');
  console.log('Operation complete.');
}
