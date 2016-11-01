/**
 * Utility for fixing invalid entries of the weather station.
 */

// ---- REQUIRES ----

// Core and contribution modules:
var argvParser = require('minimist');

// Custom modules:
var WeatherStationDatabase = require('./modules/weather_station_database');

// ---- Load parameters passed in on the command line ----

var argv = argvParser(process.argv.slice(2));

// Display help if asked for it:
if (argv.help || (!argv.timestamp && !argv.temperature && !argv.humidity)) {
  display_help();
  process.exit();
}

// Read parameters:
var timestamp = parseInt(argv.timestamp, 10);
var temperature = parseFloat(argv.temperature);
var humidity = parseFloat(argv.humidity);

if (isNaN(timestamp) || isNaN(temperature) || isNaN(humidity)) {
  display_help();
  process.exit();
}

// Configuration file:
var configFilePath = './config.prod.js';
var config = null;

// Retrieve parameter:
if (argv.config) {
  configFilePath = argv.config;
}
else {
  console.log("Configuration file parameter not provided. Assuming '" + configFilePath + "'.");
}

// Load the configuration file corresponding to the environment.
try{
  config = require(configFilePath);
  console.log("Configuration file '" + configFilePath + "' loaded.");
}
catch(e) {
  console.log("Configuration file '" + configFilePath + "' could not be loaded! Aborting.");
  process.exit();
}




// ---- MAIN ----
console.log("");

// Create database:
var wsdb = new WeatherStationDatabase(
  config.databaseFile,
  {activateDebug: config.debugMode}
);

// Delete old value:
console.log("Deleting previous value...");
wsdb.deleteWeatherData(timestamp, function(err) {
  if (err) {
    console.log("/!\\ Error while executing wsdb.deleteWeatherData(" + timestamp + "):");
    console.log(err);
    process.exit();
  }

  // Insert new value:
  console.log("Inserting new value and computing new averages...");
  wsdb.saveWeatherData(timestamp, temperature, humidity, function(err) {
    if (err) {
      console.log("/!\\ Error while executing wsdb.saveWeatherData(" + timestamp + ", " + temperature + ", " + humidity + "):");
      console.log(err);
      process.exit();
    }

    console.log("Done.");
  });
});




function display_help() {
  console.log("Usage example: node fix_entry.js --timestamp=1413773794 --temperature=18.0 --humidity=78.1");
  console.log("This would add this new entry, or update it if it's already in the database.");
}