/**
 * Configuration file for the Weather Station.
 * DEVELOPMENT version.
 */

var config = {};

// DEBUG mode:
config.debugMode = true;


// -- Server settings --

// Socket.io port to listen on:
config.socketIOPort = 33082;
// HTTP port to listen on:
config.httpPort = 8080;


// -- Weather data retrieval --

// Retrieve weather data every... (seconds):
config.weatherDataDelaySeconds = 10;
// Max number of tries before aborting a weather data retrieval from the probe:
// Warning: weatherDataRetrievalMaxNoTries*weatherDataRetrievalTriesDelay should
// be < weatherDataDelaySeconds.
config.weatherDataRetrievalMaxNoTries = 2;
// Time to wait before a new weather data retrieval try (seconds):
config.weatherDataRetrievalTriesDelay = 4;
// Path to executable retrieving weather data from the probe:
config.pathToWeatherCmd = 'sudo';
// Parameter to send to the weather executable:
config.parametersToWeatherCmd = ['node', './DHT_driver/DHT_reader_stub', '22', '14'];


// -- Weather data storage --
config.databaseFile = './data.db';

// Export configurations:
module.exports = config;
