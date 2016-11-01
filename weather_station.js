/**
 * Main file of the weather station.
 */

// ---- REQUIRES ----

// Core and contribution modules:
var http = require('http');
var io = require('socket.io');
var connect = require('connect');
var argvParser = require('minimist');

// Custom modules:
var WeatherStationDatabase = require('./modules/weather_station_database');




// ---- Internal variables ----
// Until this variable is set to TRUE, no data will be saved in database, as it
// means that the raspberry pi's internal clock hasn't been synchronized yet.
// TODO.
// var timeIsSynchronized = false;




// ---- Load parameters passed in on the commandline ----

var argv = argvParser(process.argv.slice(2));

// Display help if asked for it:
if (argv.help) {
  console.log("Usage example: node weather_station.js --config='./config.dev.js'");
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

// Create database:
var wsdb = new WeatherStationDatabase(
  config.databaseFile,
  {activateDebug: config.debugMode}
);

// Create SocketIO Server:
var socketIOServer = http.createServer();

// Initialize socket.io:
var ioServer = io.listen(socketIOServer);
// Reduce logging:
ioServer.set('log level', 1);

// Handle clients connecting to the server:
ioServer.sockets.on('connection', function (socket) {
  handleNewSocketIOClient(socket);
});

// Start the SocketIO server:
socketIOServer.listen(config.socketIOPort);
// Debug:
if (config.debugMode) {
  console.log('Weather Station socket.io service listening to port ' + config.socketIOPort + '.');
}
// Debug.

// Create and start the HTTP server:
var connectListener = connect().use(connect.static(__dirname + '/PUBLIC'));
var httpServer = http.createServer(connectListener);
httpServer.listen(config.httpPort);
// Debug:
if (config.debugMode) {
  console.log('Weather Station HTTP service listening to port ' + config.httpPort + '.');
}
// Debug.




// Log start time of the process.
wsdb.log(wsdb.WSDB_LOG_INFO, 'Weather station started.');

// Loop retrieving weather data every once in a while:
// Initial call:
getAndSaveWeatherData();
// Recurrent calls:
setInterval(getAndSaveWeatherData, config.weatherDataDelaySeconds * 1000);




// ---- Functions ----

/**
 * Retrieves weather data, and store it.
 *
 * @param int try_no
 *   Number of the current try. If this number reaches
 *   config.weatherDataRetrievalMaxNoTries, this function aborts.
 *   Note: Should be initialized at 1. If undefined, will be set to 1.
 */
function getAndSaveWeatherData(try_no) {
  // Initialize no of try, if not defined:
  try_no = try_no || 1;

  // Debug:
  if (config.debugMode) {
    var nw = new Date();
    console.log(nw.toISOString() + ': getAndSaveWeatherData(' + try_no + ')');
  }
  // Debug.

  // First, check if the internal clock is synchronized:
  // TODO (use timeIsSynchronized) & ntpq -p to check whether the RaspPi is
  // synchronized with a Time Server before saving data!

  // Retrieve weather data:
  queryWeatherData(function(weatherData) {
    if (weatherData.valid) {
      // Save retrieved data:
      wsdb.saveWeatherData(null, weatherData.temperature, weatherData.humidity);
    }
    else {
      var error_msg = '';

      // If weather data retrieval failed, try again if we did not reach the max
      // number of tries:
      if (try_no < config.weatherDataRetrievalMaxNoTries) {
        setTimeout(getAndSaveWeatherData, config.weatherDataRetrievalTriesDelay * 1000, try_no + 1);

        error_msg = 'getAndSaveWeatherData() failed (attempt no ' + try_no + ').';

        wsdb.log(wsdb.WSDB_LOG_NOTICE, error_msg);
      }
      else {
        error_msg = 'getAndSaveWeatherData() failed ' + try_no + ' times. Aborting.';

        wsdb.log(wsdb.WSDB_LOG_WARNING, error_msg);
      }
    }
  });
}

/**
 * Retrieves data weather from the probe.
 *
 * @param function callBack
 *   Function called when weather info has been retrieved from the probe.
 *   This function receives one parameter, structured as follows:
 *   Weather data (object):
 *   {
 *     temperature: float,
 *     humidity: float,
 *     valid: boolean
 *   }
 *   You should check the 'valid' property before using other properties.
 *   If the probe did not return valid data, this 'valid' bool would be false.
 */
function queryWeatherData(callBack) {
  // Retrieve data from probe:
  run_cmd(config.pathToWeatherCmd, config.parametersToWeatherCmd, function(weatherData) {
    var result = {
      temperature: 0.0,
      humidity: 0.0,
      valid: false,
    };

    // Debug:
    if (config.debugMode) {
      var nw = new Date();
      console.log(nw.toISOString() + ': >> queryWeatherData returned [' + weatherData + ']');
    }
    // Debug.

    // Parse weather data to return it as an object:
    var weatherBits = weatherData.split(';');
    if (weatherBits.length >= 2) {
      result.temperature = weatherBits[0];
      result.humidity = weatherBits[1];
      result.valid = true;
    }

    callBack(result);
  });
}

/**
 * Handles a new socket.io client.
 */
function handleNewSocketIOClient(socket) {
  // - Retrieve weather data -
  // Data should have the following structure:
  // {
  //   start: timestamp,
  //   end: timestamp,
  // }
  socket.on('getWeatherData', function (data, responseFunction) {
    wsdb.getWeatherData(data.start, data.end, null, function(err, result) {
      if (err) {
        var error_msg = 'handleNewSocketIOClient(): Retrieving data from the database failed.';

        wsdb.log(wsdb.WSDB_LOG_ERROR, error_msg);
      }

      // Answer back results.
      responseFunction(result);
    });
  });
}

/**
 * Runs a shell command.
 *
 * @param string cmd
 *   Command to run.
 * @param Array args
 *   Parameters.
 * @param function callBack
 *   What to call when the command has finished.
 *   Given function will receive the command output as parameter.
 */
function run_cmd(cmd, args, callBack) {
  var spawn = require('child_process').spawn;
  var child = spawn(cmd, args);
  var resp = '';

  // Concatenate return data:
  child.stdout.on('data', function(buffer) {
    resp += buffer.toString();
  });
  // When process has finished, call given callback:
  child.stdout.on('end', function() {
    callBack(resp);
  });
}
