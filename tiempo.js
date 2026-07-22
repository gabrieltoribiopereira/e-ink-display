const getCurrentTimeDate = () => {

  let currentTimeDate = new Date();
  var weekday = new Array(7);
  weekday[0] = "DOM";
  weekday[1] = "LUN";
  weekday[2] = "MAR";
  weekday[3] = "MIE";
  weekday[4] = "JUE";
  weekday[5] = "VIE";
  weekday[6] = "SAB";
  var month = new Array();
  month[0] = "ENE";
  month[1] = "FEB";
  month[2] = "MAR";
  month[3] = "ABR";
  month[4] = "MAY";
  month[5] = "JUN";
  month[6] = "JUL";
  month[7] = "AGO";
  month[8] = "SEP";
  month[9] = "OCT";
  month[10] = "NOV";
  month[11] = "DEC";



  var hours = currentTimeDate.getHours();
  var minutes = currentTimeDate.getMinutes();
  if (minutes < 10) {
    minutes = '0' + minutes;
  } else {
    minutes = minutes;
  }
  var AMPM = hours >= 12 ? 'PM' : 'AM';
  if (hours === 12) {
    hours = 12;

  } else {

    hours = hours % 12;

  }
  var currentTime = `${hours}:${minutes}${AMPM}`;
  var currentDay = weekday[currentTimeDate.getDay()];
  var currentDate = currentTimeDate.getDate();
  var currentMonth = month[currentTimeDate.getMonth()];
  var CurrentYear = currentTimeDate.getFullYear();
  var fullDate = `${currentDate} ${currentMonth} ${CurrentYear}`;
  document.getElementById("time").innerHTML = currentTime;
  document.getElementById("date").innerHTML = fullDate;
  setTimeout(getCurrentTimeDate, 500);

}
getCurrentTimeDate()
setInterval(getCurrentTimeDate, 500)

async function getWeather() {
  const lat = CONFIG.LAT;
  const lon = CONFIG.LON;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;

  const res = await fetch(url);
  const data = await res.json();
  console.log(data);

  const temp = Math.round(data.current.temperature_2m);
  const code = data.current.weather_code;

  document.getElementById("temp").textContent = `${temp}°C`;
  document.getElementById("condition").textContent = weatherText(code);
}

function weatherText(code) {
  if (code === 0) return "☀️";        // luego lo cambias por SVG
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

getWeather();
setInterval(getWeather, 600000); // actualiza cada 10 minutos

function weatherIcon(code) {
  if (code === 0) return "☀️";        // luego lo cambias por SVG
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}
