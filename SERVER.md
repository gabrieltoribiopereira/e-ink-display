# Explicación de como usar el server

## 1 empezar el server:

node server.js

## 2 ejecutar botón:
se tiene que hacer en otra terminal dentro del proyecto:

curl -X POST http://localhost:8080/boton -d "2" -o boton2.png

## 3(extra) ejecutar terminal en segundo plando

node server.js &

## en caso de que haya otro server hay que matarlo:
fuser -k 8080/tcp
