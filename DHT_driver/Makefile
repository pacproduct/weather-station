CC = gcc
CFLAGS =  -std=c99 -I. -lbcm2835
DEPS = 
OBJ = DHT_reader.o

%.o: %.c $(DEPS)
	$(CC) -c -o $@ $< $(CFLAGS)

DHT_reader: $(OBJ)
	gcc -o $@ $^ $(CFLAGS)
