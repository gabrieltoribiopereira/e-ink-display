# Create a server fot the buttons

## arancar:
cd /home/gabriel/Proyectos/e-ink/server
node server.js
# pulsar botón x y guardar la imagen que devuelve:(esto va en otra terminal)
curl -s -X POST -d 'x' http://localhost:8002/boton -o prueba.png  //hay que cambiar la x por el numero del botón
# ver la pantalla actual sin pulsar:
curl -s http://localhost:8002/captura.png -o actual.png

Entonces ahora tengo que pensar como va hacer el esp32 para poder descargar la imagen. 

Tengo varias opciones voy a pensar cual es la mejor. Hay que tener en cuenta que el proyecto tiene las capturas entonces se las tiene que enviar al esp32 por otro lado para que la web reciba el input hay que empezar el server. Este no se si vive en local o en la nube. La pagina vivira en la nube 100% pero lo que no se si vivira en la nube es 'server.js'. input-->Esp32 despierta-->server.js-->web-->captura-->esp32 ip --> display  creo que la opción mas rapida es enviar al esp32 el mapa en binario por lo cual la web tiene que convertir la captura en blanco y negro con un algoritmo que tengo que hacer aparte. Lo que no me acaba de quedar claro es como descargar esa información en el esp32

# detalle importante para vincular con to-do hay que habrir el gtask:
cd /home/gabriel/Proyectos/e-ink
.venv/bin/python scripts/gtasks.py
