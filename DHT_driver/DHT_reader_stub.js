/**
 * Stub version of the DHT_reader program.
 * Returns random values to simulate probing for temperature and humidity.
 * Return format:
 * <float: temperature>;<float: humidity>
 */

var temperature;
var humidity;

temperature = Math.floor((Math.random() * 200)) / 10;
humidity = Math.floor((Math.random() * 1000)) / 10;

process.stdout.write(temperature + ";" + humidity);
