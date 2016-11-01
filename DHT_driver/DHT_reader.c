//  How to access GPIO registers from C-code on the Raspberry-Pi
//  Example program
//  15-January-2012
//  Dom and Gert
//


// Access from ARM Running Linux

#define BCM2708_PERI_BASE        0x20000000
#define GPIO_BASE                (BCM2708_PERI_BASE + 0x200000) /* GPIO controller */
#define _BSD_SOURCE

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <dirent.h>
#include <fcntl.h>
#include <assert.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <bcm2835.h>
#include <unistd.h>

#define MAX_NUM_BITS 100
#define MAX_NUM_CYCLES_BETWEEN_BITS 100000

// #define DEBUG

#define DHT11 11
#define DHT22 22
#define AM2302 22
#define BIT_US_THRESHOLD 50.0

int read_DHT(int type, int pin);
double get_elapsed_time(struct timeval start, struct timeval end);

int main(int argc, char **argv)
{
  if (!bcm2835_init()) {
    return 1;
  }

  if (argc != 3) {
    printf("usage: %s [11|22|2302] GPIOpin#\n", argv[0]);
    printf("example: %s 2302 4 - Read from an AM2302 connected to GPIO #4\n", argv[0]);
    return 2;
  }
  
  int type = 0;
  if (strcmp(argv[1], "11") == 0) type = DHT11;
  if (strcmp(argv[1], "22") == 0) type = DHT22;
  if (strcmp(argv[1], "2302") == 0) type = AM2302;
  
  if (type == 0) {
    printf("Select 11, 22, 2302 as type!\n");
    return 3;
  }
  
  int dhtpin = atoi(argv[2]);

  if (dhtpin <= 0) {
    printf("Please select a valid GPIO pin #\n");
    return 4;
  }
  
#ifdef DEBUG
  printf("Using pin #%d\n", dhtpin);
#endif

  return read_DHT(type, dhtpin);

} // main

double raw_bits[250];
int raw_bitidx = 0;

int data[100];

int read_DHT(int type, int pin) {
  int cycles_counter = 0;
  int laststate;
  struct timeval time_temp_start, time_start, time_end;
  double time_diff;
  
  // Inits:
  data[0] = data[1] = data[2] = data[3] = data[4] = 0;

  // #### Send START SIGNAL ####
  // Switch GPIO pin to OUTPUT
  bcm2835_gpio_fsel(pin, BCM2835_GPIO_FSEL_OUTP);
  // Send start signal:
  bcm2835_gpio_write(pin, LOW);
  usleep(20000);  // 20ms
  bcm2835_gpio_write(pin, HIGH);
  laststate = HIGH;
  // Switch GPIO pin to INPUT
  bcm2835_gpio_fsel(pin, BCM2835_GPIO_FSEL_INPT);

  // #### READ RAW DATA ####
  // Initial start time:
  gettimeofday(&time_start, NULL);

  int end_of_transmission_reading = 0;
  for (int i = 0; i < MAX_NUM_BITS; ++i) {
    cycles_counter = 0;

    while (bcm2835_gpio_lev(pin) == laststate) {
      // If current bit lasted too long, end reading process:
      ++cycles_counter;
      if (cycles_counter > MAX_NUM_CYCLES_BETWEEN_BITS) {
        end_of_transmission_reading = 1;
        break;
      }
    }
    
    // End time:
    gettimeofday(&time_end, NULL);
    
    // Prepare next start time:
    time_temp_start = time_end;
    
    // Compute how long that bit lasted:
    time_diff = get_elapsed_time(time_start, time_end);
    
    // Save start of next bit:
    time_start = time_temp_start;
    
    // Save raw data:
    raw_bits[raw_bitidx++] = time_diff;
    
    // Save last state:
    laststate = bcm2835_gpio_lev(pin);
    
    // Exit reading process if we reached the end of it:
    if (end_of_transmission_reading == 1) {
      break;
    }
  }
  
  // #### COMPILE READ DATA ####
  int processed_bit_index = 0;
  
  for (int i = 2; i < raw_bitidx && i < MAX_NUM_BITS; i += 2) {
    // Save each bit into the storage bytes:
    data[processed_bit_index/8] <<= 1;
    if (raw_bits[i] > BIT_US_THRESHOLD) {
      data[processed_bit_index/8] |= 1;
    }
    
    ++processed_bit_index;
  }
  
  // Substract 1 from processed_bit_index to make sure it reflects the number or received bits:
  --processed_bit_index;

#ifdef DEBUG
  for (int i = 0; i < raw_bitidx && i < 3; ++i) {
    printf("bit %d: %.01fus [Start bit]\n", i, raw_bits[i]);
  }
  for (int i = 3; i < raw_bitidx && i < MAX_NUM_BITS; i += 2) {
    printf("bit %d: %.01fus\n", i, raw_bits[i]);
    printf("bit %d: %.01fus (%d)\n", i + 1, raw_bits[i + 1], raw_bits[i + 1] > BIT_US_THRESHOLD);
  }
  
  printf("Data (%d): 0x%x 0x%x 0x%x 0x%x 0x%x\n", processed_bit_index, data[0], data[1], data[2], data[3], data[4]);
#endif

  // #### GENERATE OUTPUT ####
  // Make sure we received the right number of bits, and that the checksum is valid:
  if ((processed_bit_index == 40) && (data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xFF))) {
    if (type == DHT11) {
      printf("%d;%d", data[2], data[0]);
    }
    
    if (type == DHT22) {
      float temperature, humidity;
      humidity = data[0] * 256 + data[1];
      humidity /= 10;

      temperature = (data[2] & 0x7F)* 256 + data[3];
      temperature /= 10.0;
      
      if (data[2] & 0x80) {
        temperature *= -1;
      }
      
      printf("%.1f;%.1f", temperature, humidity);
    }
    
    // All is fine:
    return 0;
  }

  // Something went wrong :(
  return 100;
}

double get_elapsed_time(struct timeval start, struct timeval end) {
  double start_ms , end_ms , diff_ms;
   
  start_ms = (double)start.tv_sec * 1000000 + (double)start.tv_usec;
  end_ms = (double)end.tv_sec * 1000000 + (double)end.tv_usec;
   
  diff_ms = (double)end_ms - (double)start_ms;
   
  return diff_ms;
}
