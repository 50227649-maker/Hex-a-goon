# Glaciar Hexagonal — Multiplayer (prototipo)

## Qué incluye
- Salas privadas con código de 5 caracteres.
- Máximo 8 jugadores por sala.
- El anfitrión inicia la partida.
- Posiciones y orientación de jugadores se transmiten en tiempo real.
- Bots locales y gráficos originales conservados.

## Importante: desplegar el servidor
El HTML no puede crear una sala online por sí solo: el servidor `server.js` debe estar publicado. El cliente viene configurado inicialmente con `https://glaciar-hexagonal.onrender.com`; cambiá `SOCKET_URL` en `index.html` por la URL real que te asigne Render.

### Opción gratuita con Render
1. Subí el contenido de esta carpeta a un repositorio de GitHub.
2. En Render, elegí **New + → Web Service** y conectá el repositorio.
3. Build command: `npm install`; Start command: `npm start`. El archivo `render.yaml` contiene esos valores si usás Blueprint.
4. Copiá la URL HTTPS que Render asigne, por ejemplo `https://tu-app.onrender.com`.
5. Reemplazá `https://glaciar-hexagonal.onrender.com` en `index.html` por esa URL y volvé a subir el HTML junto con el servidor (o mantené ambos en el mismo repo y redeploy).
6. Abrí el `index.html` actualizado en Chrome/Edge con internet. Una persona crea sala y comparte el código; las demás lo escriben y se unen.

Los planes gratuitos de hosting pueden suspender el servicio cuando no se usa, por lo que la primera conexión puede tardar.

## Ejecutar servidor localmente
Requiere Node.js instalado:
```bash
npm install
npm start
```
El servidor queda en `http://localhost:3000`. Para que otros jugadores lo usen por internet, igual hace falta publicarlo o configurar una red accesible.

## Limitaciones del primer prototipo
La sincronización online cubre posiciones, orientación y estado vivo de los jugadores. La física, los bots y el colapso de baldosas siguen simulándose en cada navegador; no es todavía una simulación autoritativa, así que puede haber pequeñas diferencias entre clientes. No se requiere cuenta ni se guarda información personal.
