// Connect to socket.io server:
var socket = io.connect(window.location.hostname + ':33082');

var chartContainer = null;
var chart = null;

// When JQuery is loaded:
$(function () {
  chartContainer = $('#chart_container');

  /**
   * Asks fresh data to the server.
   *
   * @param int timestamp_start
   *   Start timestamp in sec.
   * @param int timestamp_end
   *   End timestamp in sec.
   * @param function callback
   *   Function to call when the server responds back. Signature:
   *   function(data) where data is what was returned by the server.
   */
  function getDataFromServer(timestamp_start, timestamp_end, callback) {
    // Ask the server for fresh data:
    socket.emit(
      'getWeatherData',
      {
        start: timestamp_start,
        end: timestamp_end,
      },
      callback
    );
  }

  /**
   * Load new data depending on the selected min and max.
   */
  function afterSetExtremes(e) {
    // Show loading msg:
    chart.showLoading('Chargement des données depuis le serveurs...');

    getDataFromServer(e.min / 1000, e.max / 1000, function(serverData) {
      updateChart(serverData);

      // Hide loading msg:
      chart.hideLoading();
    });
  }

  /**
   * Helper converting data received from the server, to the data format needed
   * by HighChart and our other functions.
   * @param object serverData
   *   Data coming from the remote server. Expected structure: See what
   *   WeatherStationDatabase.getWeatherData() returns.
   * @return object
   *   Data ready to be used by HighChart and our functions. Structure:
   *   {
   *     granularity: string ('raw'|'hour'|'day'),
   *     chartType: string ('line', 'columnrange'),
   *     temperature: {
   *       data: [
   *         [int (timestamp in milliseconds), Number, Number],
   *         ...
   *       ],
   *       min: Number,
   *       max: Number
   *     },
   *     humidity: {
   *       data: [
   *         [int (timestamp in milliseconds), Number, Number],
   *         ...
   *       ],
   *       min: Number,
   *       max: Number
   *     },
   *   }
   */
  function serverDataToClientData(serverData) {
    var temperature_data = [];
    var humidity_data = [];
    var min_temperature = null;
    var max_temperature = null;
    var min_humidity = null;
    var max_humidity = null;

    // Select appropriate chartType:
    var chartType = 'line';
    // TODO: Switching from 'columnrange' to 'line' fails with Highstock.
    // Did not figure out how to solve that yet :(
    // A simpler way wuld probably to have 4 series in fact:
    // 2 for averages
    // 2 others for ranges
    // and display the 2 firsts or the 2 lasts depending on what we wanna disp.
    /*
    if (serverData.granularity == 'day') {
      chartType = 'columnrange';
    }
    */

    for(var index in serverData.data) {
      var item = serverData.data[index];
      var millitimestamp = item.timestamp * 1000;

      // Compute temperature min/max:
      if (item.min_temperature && (min_temperature === null || min_temperature > item.min_temperature)) {
        min_temperature = item.min_temperature;
      }
      else if (min_temperature === null || min_temperature > item.temperature) {
        min_temperature = item.temperature;
      }
      if (item.max_temperature && (max_temperature === null || max_temperature < item.max_temperature)) {
        max_temperature = item.max_temperature;
      }
      else if (max_temperature === null || max_temperature < item.temperature) {
        max_temperature = item.temperature;
      }

      // Compute humidity min/max:
      if (item.min_humidity && (min_humidity === null || min_humidity > item.min_humidity)) {
        min_humidity = item.min_humidity;
      }
      else if (min_humidity === null || min_humidity > item.humidity) {
        min_humidity = item.humidity;
      }
      if (item.max_humidity && (max_humidity === null || max_humidity < item.max_humidity)) {
        max_humidity = item.max_humidity;
      }
      else if (max_humidity === null || max_humidity < item.humidity) {
        max_humidity = item.humidity;
      }

      // Depending on the current chartType, prepare a chart of points, or of
      // minimum and maximum values:
      if (chartType == 'line') {
        temperature_data.push([millitimestamp, item.temperature]);
        humidity_data.push([millitimestamp, item.humidity]);
      }
      else {
        temperature_data.push([millitimestamp, item.min_temperature, item.max_temperature]);
        humidity_data.push([millitimestamp, item.min_humidity, item.max_humidity]);
      }
    }

    return {
      granularity: serverData.granularity,
      chartType: chartType,
      temperature: {
        data: temperature_data,
        min: min_temperature,
        max: max_temperature
      },
      humidity: {
        data: humidity_data,
        min: min_humidity,
        max: max_humidity
      }
    };
  }

  function drawMinMax(min_temperature, max_temperature) {
    // Draw them only if the current chart has extremes (i.e. is not empty):
    if (min_temperature && max_temperature) {
      // Round up extremes to 2 decimal digits:
      min_temperature = min_temperature.toFixed(2);
      max_temperature = max_temperature.toFixed(2);

      // Remove plotLines:
      chart.yAxis[0].removePlotLine('temp-min');
      chart.yAxis[0].removePlotLine('temp-max');

      // Retrieve current extremes:
      var extremes = chart.yAxis[0].getExtremes();

      // If extremes do not include min and max, reset extremes:
      var new_min_extreme = extremes.min;
      var new_max_extreme = extremes.max;
      var new_extremes = false;
      if (extremes.min > min_temperature) {
        new_min_extreme = min_temperature;
        new_extremes = true;
      }
      if (extremes.max < max_temperature) {
        new_max_extreme = max_temperature;
        new_extremes = true;
      }
      if (new_extremes) {
        chart.yAxis[0].setExtremes(new_min_extreme, new_max_extreme, true);
      }

      chart.yAxis[0].addPlotLine({
        color: '#5cb8e5',
        dashStyle : 'shortdash',
        id: 'temp-min',
        value: min_temperature,
        width : 1,
        label : {
          text : 'Température MIN : ' + min_temperature + ' °C',
          x: 40,
          style: {
            'color': '#5cb8e5',
          },
        },
        zIndex: 5,
      });

      chart.yAxis[0].addPlotLine({
        color: '#ff6767',
        dashStyle : 'shortdash',
        id: 'temp-max',
        value: max_temperature,
        width : 1,
        label : {
          text : 'Température MAX : ' + max_temperature + ' °C',
          x: 40,
          style: {'color': '#ff6767'},
        },
        zIndex: 6,
      });
    }
  }

  function updateChart(serverData) {
    // Prepare chart data:
    var data = serverDataToClientData(serverData);

    // Add a final null value corresponding to the current time so the
    // timeframe goes up until the latest values:
    if (data.chartType == 'line') {
      data.temperature.data.push([Date.now(), null]);
    }
    else {
      data.temperature.data.push([Date.now(), null, null]);
    }

    // Delete current series:
    /*
    for (var i = 0; i < chart.series.length; i++) {
      chart.series[i].remove(false);
    }
    */

    // Update series:
    chart.series[0].update(
      {
        data: data.temperature.data,
        type: data.chartType
      },
      false
    );
    chart.series[1].update(
      {
        data: data.humidity.data,
        type: data.chartType
      },
      false
    );

    // Refresh min max plots:
    drawMinMax(data.temperature.min, data.temperature.max);

    // Redraw the chart:
    chart.redraw();
  }

  // Initial query and chart building.
  var startTimestampToQuery = (Date.now() / 1000) - (7 * 24 * 3600);
  var endTimestampToQuery = (Date.now() / 1000);
  getDataFromServer(startTimestampToQuery, endTimestampToQuery, function(serverData) {
    // Prepare chart data:
    var data = serverDataToClientData(serverData);

    // Add a final null value corresponding to the current time so the
    // timeframe goes up until the latest values:
    if (data.chartType == 'line') {
      data.temperature.data.push([Date.now(), null]);
    }
    else {
      data.temperature.data.push([Date.now(), null, null]);
    }

    // Create the chart.
    chartContainer.highcharts('StockChart', {
      chart : {
        zoomType: 'x'
      },

      navigator : {
        adaptToUpdatedData: false,
        series : {
          data: data.temperature.data
        }
      },

      scrollbar: {
        liveRedraw: false
      },

      title: {
        text: 'T°C'
      },

      rangeSelector : {
        buttons: [{
          type: 'hour',
          count: 6,
          text: '6H'
        }, {
          type: 'day',
          count: 1,
          text: '24H'
        }, {
          type: 'month',
          count: 1,
          text: 'M'
        }, {
          type: 'year',
          count: 1,
          text: 'A'
        }, {
          type: 'all',
          text: '∞'
        }],
        inputEnabled: false,
        selected : 4 // All
      },

      xAxis : {
        events : {
          afterSetExtremes: afterSetExtremes
        },
        // Minimum range: 1 hour.
        minRange: 3600 * 1000,
        ordinal: false,
      },

      yAxis: [{
        title: {
          text: 'Température (°C)',
          style: {'color': '#00aaff'},
        },
      }, {
        title: {
          text: 'Humidité (%)',
          style: {'color': '#bababa'},
        },
        opposite: true,
      }],

      series : [{
        name: 'Température',
        tooltip: {
          valueDecimals: 1,
          valueSuffix: ' °C',
        },
        yAxis: 0,
        zIndex: 2,
        color: '#00aaff',
        dataGrouping: {
          enabled: false
        },
        data: data.temperature.data,
        type: data.chartType
      }, {
        name: 'Humidité',
        tooltip: {
          valueDecimals: 1,
          valueSuffix: ' %',
        },
        yAxis: 1,
        zIndex: 1,
        color: '#666666',
        dataGrouping: {
          enabled: false
        },
        data: data.humidity.data,
        type: data.chartType
      }]
    });

    // Reference chart:
    chart = chartContainer.highcharts();

    // Draw min max plots:
    drawMinMax(data.temperature.min, data.temperature.max);
  });
});




/**
 * Dark theme for Highcharts JS
 * @author Torstein Honsi
 */

// Load the fonts
Highcharts.createElement('link', {
   href: 'http://fonts.googleapis.com/css?family=Homenaje',
   rel: 'stylesheet',
   type: 'text/css'
}, null, document.getElementsByTagName('head')[0]);

Highcharts.theme = {
   colors: ["#2b908f", "#90ee7e", "#f45b5b", "#7798BF", "#aaeeee", "#ff0066", "#eeaaee",
      "#55BF3B", "#DF5353", "#7798BF", "#aaeeee"],
   chart: {
      backgroundColor: {
         linearGradient: { x1: 0, y1: 0, x2: 1, y2: 1 },
         stops: [
            [0, '#2a2a2b'],
            [1, '#3e3e40']
         ]
      },
      style: {
         fontFamily: "'Homenaje', sans-serif"
      },
      plotBorderColor: '#606063'
   },
   title: {
      style: {
         color: '#E0E0E3',
         textTransform: 'uppercase',
         fontSize: '16px'
      }
   },
   subtitle: {
      style: {
         color: '#E0E0E3',
         textTransform: 'uppercase'
      }
   },
   xAxis: {
      gridLineColor: '#707073',
      labels: {
         style: {
            color: '#E0E0E3'
         }
      },
      lineColor: '#707073',
      minorGridLineColor: '#505053',
      tickColor: '#707073',
      title: {
         style: {
            color: '#A0A0A3'

         }
      }
   },
   yAxis: {
      gridLineColor: '#707073',
      labels: {
         style: {
            color: '#E0E0E3'
         }
      },
      lineColor: '#707073',
      minorGridLineColor: '#505053',
      tickColor: '#707073',
      tickWidth: 1,
      title: {
         style: {
            color: '#A0A0A3'
         }
      }
   },
   tooltip: {
     backgroundColor: 'rgba(0, 0, 0, 0.6)',
     style: {
       color: '#F0F0F0',
       fontSize: '120%'
     }
   },
   plotOptions: {
      series: {
         dataLabels: {
            color: '#B0B0B3'
         },
         marker: {
            lineColor: '#333'
         }
      },
      boxplot: {
         fillColor: '#505053'
      },
      candlestick: {
         lineColor: 'white'
      },
      errorbar: {
         color: 'white'
      }
   },
   legend: {
      itemStyle: {
         color: '#E0E0E3'
      },
      itemHoverStyle: {
         color: '#FFF'
      },
      itemHiddenStyle: {
         color: '#606063'
      }
   },
   credits: {
      style: {
         color: '#666'
      }
   },
   labels: {
      style: {
         color: '#707073'
      }
   },

   drilldown: {
      activeAxisLabelStyle: {
         color: '#F0F0F3'
      },
      activeDataLabelStyle: {
         color: '#F0F0F3'
      }
   },

   navigation: {
      buttonOptions: {
         symbolStroke: '#DDDDDD',
         theme: {
            fill: '#505053'
         }
      }
   },

   // scroll charts
   rangeSelector: {
      buttonTheme: {
         fill: '#505053',
         stroke: '#000000',
         style: {
            color: '#CCC'
         },
         states: {
            hover: {
               fill: '#707073',
               stroke: '#000000',
               style: {
                  color: 'white'
               }
            },
            select: {
               fill: '#000003',
               stroke: '#000000',
               style: {
                  color: 'white'
               }
            }
         }
      },
      inputBoxBorderColor: '#505053',
      inputStyle: {
         backgroundColor: '#333',
         color: 'silver'
      },
      labelStyle: {
         color: 'silver'
      }
   },

   navigator: {
      handles: {
         backgroundColor: '#666',
         borderColor: '#AAA'
      },
      outlineColor: '#CCC',
      maskFill: 'rgba(255,255,255,0.1)',
      series: {
         color: '#7798BF',
         lineColor: '#A6C7ED'
      },
      xAxis: {
         gridLineColor: '#505053'
      }
   },

   scrollbar: {
      barBackgroundColor: '#808083',
      barBorderColor: '#808083',
      buttonArrowColor: '#CCC',
      buttonBackgroundColor: '#606063',
      buttonBorderColor: '#606063',
      rifleColor: '#FFF',
      trackBackgroundColor: '#404043',
      trackBorderColor: '#404043'
   },

   // special colors for some of the
   legendBackgroundColor: 'rgba(0, 0, 0, 0.5)',
   background2: '#505053',
   dataLabelsColor: '#B0B0B3',
   textColor: '#C0C0C0',
   contrastTextColor: '#F0F0F3',
   maskColor: 'rgba(255,255,255,0.3)'
};

// Apply the theme
Highcharts.setOptions(Highcharts.theme);
