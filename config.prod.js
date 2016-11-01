/**
 * Configuration file for the Weather Station.
 * PRODUCTION version.
 */

var config = {};

// DEBUG mode:
config.debugMode = false;


// -- Server settings --

// Socket.io port to listen on:
config.socketIOPort = 33082;
// HTTP port to listen on:
config.httpPort = 8080;


// -- Weather data retrieval --

// Retrieve weather data every... (seconds):
config.weatherDataDelaySeconds = 300;
// Max number of tries before aborting a weather data retrieval from the probe:
// Warning: weatherDataRetrievalMaxNoTries*weatherDataRetrievalTriesDelay should
// be < weatherDataDelaySeconds.
config.weatherDataRetrievalMaxNoTries = 20;
// Time to wait before a new weather data retrieval try (seconds):
config.weatherDataRetrievalTriesDelay = 4;
// Path to executable retrieving weather data from the probe:
config.pathToWeatherCmd = 'sudo';
// Parameter to send to the weather executable:
// Note: The first parameter sent to DHT_reader is the captor type (11, 22 or 2302), and the second is the communication pin.
config.parametersToWeatherCmd = ['/home/pi/weather_station/DHT_driver/DHT_reader', '22', '14'];


// -- Weather data storage --
config.databaseFile = './data.db';

// Export configurations:
module.exports = config;
