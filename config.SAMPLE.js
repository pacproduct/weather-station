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
config.weatherDataDelaySeconds = 60;
// Max number of tries before aborting a weather data retrieval from the probe:
// Warning: weatherDataRetrievalMaxNoTries*weatherDataRetrievalTriesDelay should
// be < weatherDataDelaySeconds.
config.weatherDataRetrievalMaxNoTries = 10;
// Time to wait before a new weather data retrieval try (seconds):
config.weatherDataRetrievalTriesDelay = 4;
// Probes.
config.probes = [
  {
    id: 1,
    command: 'sudo',
    commandParameters: ['node', './DHT_driver/DHT_reader_stub', '22', '14'],
  },
  {
    id: 2,
    command: 'sudo',
    commandParameters: ['node', './DHT_driver/DHT_reader_stub', '22', '15'],
  },
];


// -- Weather data storage --
config.databaseFile = './data.db';

// Export configurations:
module.exports = config;
