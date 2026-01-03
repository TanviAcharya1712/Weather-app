// Open-Meteo API URLs
const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_API_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// DOM Elements
const cityInput = document.getElementById("city-input");
const searchBtn = document.getElementById("search-btn");
const weatherData = document.getElementById("weather-data");
const errorMessage = document.getElementById("error-message");
const loading = document.getElementById("loading");

// Event Listener for Search Button
searchBtn.addEventListener("click", () => {
    const query = cityInput.value.trim();
    if (query) {
        fetchCoordinates(query);
    } else {
        showError("Please enter a city name or pincode.");
    }
});

// Event Listener for Enter Key
cityInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        searchBtn.click();
    }
});

// Function to fetch coordinates (Geocoding)
// Function to fetch coordinates (Geocoding)
async function fetchCoordinates(query) {
    showLoading();
    try {
        // 1. Try Open-Meteo Geocoding API first
        const response = await fetch(`${GEOCODING_API_URL}?name=${query}&count=1&language=en&format=json`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // Success with Open-Meteo
            const { name, latitude, longitude, country, admin1 } = data.results[0];
            const locationName = admin1 ? `${name}, ${admin1}, ${country}` : `${name}, ${country}`;
            loadWeatherData(locationName, latitude, longitude);
        } else {
            // 2. Fallback to Nominatim API (OpenStreetMap)
            console.log("Open-Meteo failed, trying Nominatim fallback...");
            const nomResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&limit=1`);
            const nomData = await nomResponse.json();

            if (nomData && nomData.length > 0) {
                const result = nomData[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);

                // Construct location name from address details
                const addr = result.address;
                const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || result.name;
                const state = addr.state || addr.region || "";
                const country = addr.country || "";

                // Filter out empty parts and join
                const locationParts = [city, state, country].filter(part => part);
                const locationName = locationParts.join(", ");

                loadWeatherData(locationName, lat, lon);
            } else {
                showError("City lookup failed. Please check the spelling or try a different city name/pincode.");
                hideLoading(false);
            }
        }
    } catch (error) {
        console.error("Geocoding Error:", error);
        showError("Failed to fetch location data. Please try again.");
        hideLoading(false);
    }
}

// Helper to Trigger Weather Fetch
async function loadWeatherData(locationName, lat, lon) {
    // Update City Name in UI
    document.getElementById("city-name").innerText = locationName;

    // Fetch Weather and AQI data
    try {
        await Promise.all([
            fetchWeather(lat, lon),
            fetchAQI(lat, lon)
        ]);
        hideLoading();
    } catch (e) {
        console.error("Data Load Error", e);
        // hideLoading handled in individual catch or here if needed, 
        // but fetchWeather has its own error handling visual.
        hideLoading();
    }
}

// Function to fetch Weather Data
async function fetchWeather(lat, lon) {
    try {
        const response = await fetch(`${WEATHER_API_URL}?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m,visibility&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
        const data = await response.json();

        updateCurrentWeather(data);
        updateForecast(data);

    } catch (error) {
        console.error("Weather Error:", error);
        showError("Failed to fetch weather data.");
    }
}

// Function to fetch Air Quality Data
async function fetchAQI(lat, lon) {
    try {
        const response = await fetch(`${AIR_QUALITY_API_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,uv_index,aerosol_optical_depth&timezone=auto`);
        const data = await response.json();

        updateAQI(data);
    } catch (error) {

        console.error("AQI Error:", error);
        // Don't block the UI if AQI fails, just show N/A
    }
}

// Function to Update Current Weather UI
function updateCurrentWeather(data) {
    const current = data.current_weather;
    const daily = data.daily;

    // Date
    const date = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById("current-date").innerText = date.toLocaleDateString('en-US', options);

    // Temperature
    document.getElementById("temperature").innerText = `${Math.round(current.temperature)}°C`;

    // Wind
    document.getElementById("wind-speed").innerText = current.windspeed;

    // Humidity (Note: Current weather endpoint doesn't always have humidity, using hourly[0] approximation or hiding if not critical)
    // Actually, we can get humidity from the first hour of "hourly" which usually corresponds to now-ish or filter by time.
    // For simplicity for students, let's take the humidity from the current hour index.
    const currentHourIndex = new Date().getHours();
    const humidity = data.hourly.relativehumidity_2m[currentHourIndex];
    document.getElementById("humidity").innerText = humidity;

    // Condition & Icon
    const wmoCode = current.weathercode;
    const condition = getWeatherCondition(wmoCode);
    document.getElementById("weather-condition").innerText = condition.label;

    const iconElement = document.getElementById("weather-icon");
    iconElement.className = `fa-solid ${condition.icon} weather-icon`;
}

// Function to Update 7-Day Forecast UI
function updateForecast(data) {
    const container = document.getElementById("forecast-container");
    container.innerHTML = ""; // Clear previous

    const daily = data.daily;

    // We get 7 days by default from the API usually, loop through them
    for (let i = 0; i < daily.time.length; i++) {
        const dateStr = daily.time[i];
        const dateObj = new Date(dateStr);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);
        const code = daily.weathercode[i];
        const icon = getWeatherCondition(code).icon;

        const card = document.createElement("div");
        card.className = "forecast-item";
        card.innerHTML = `
            <span class="day">${dayName}</span>
            <i class="fa-solid ${icon}"></i>
            <p class="temp">${maxTemp}° / ${minTemp}°</p>
        `;
        container.appendChild(card);
    }
}

// Function to Update AQI UI
function updateAQI(data) {
    const current = data.current;

    if (!current) return;

    const aqi = current.us_aqi;
    const pm25 = current.pm2_5;
    const pm10 = current.pm10;
    const no2 = current.nitrogen_dioxide;
    const o3 = current.ozone;
    const so2 = current.sulphur_dioxide;
    const co = current.carbon_monoxide;
    const uv = current.uv_index;
    const aerosol = current.aerosol_optical_depth;

    document.getElementById("aqi-value").innerText = aqi;

    // Determine Status
    let status = "Good";
    let colorClass = "aqi-good";
    if (aqi > 50) { status = "Moderate"; colorClass = "aqi-moderate"; }
    if (aqi > 100) { status = "Unhealthy for Sensitive Groups"; colorClass = "aqi-poor"; }
    if (aqi > 150) { status = "Unhealthy"; colorClass = "aqi-poor"; }
    if (aqi > 200) { status = "Very Unhealthy"; colorClass = "aqi-very-poor"; }

    const statusEl = document.getElementById("aqi-status");
    statusEl.innerText = status;
    statusEl.className = colorClass; // Reset class and add new one

    document.getElementById("pm25").innerText = pm25;
    document.getElementById("pm10").innerText = pm10;
    document.getElementById("no2").innerText = no2;
    document.getElementById("o3").innerText = o3;
    document.getElementById("so2").innerText = so2;
    document.getElementById("co").innerText = co;
    document.getElementById("uv").innerText = uv;
    document.getElementById("aerosol").innerText = aerosol || "N/A";
}

// Helper: WMO Weather Code to Text/Icon
function getWeatherCondition(code) {
    // WMO Weather interpretation codes (WW)
    // 0: Clear sky
    // 1, 2, 3: Mainly clear, partly cloudy, and overcast
    // 45, 48: Fog and depositing rime fog
    // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
    // 61, 63, 65: Rain: Slight, moderate and heavy intensity
    // 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
    // 80, 81, 82: Rain showers: Slight, moderate, and violent
    // 95, 96, 99: Thunderstorm, including hail

    if (code === 0) return { label: "Clear Sky", icon: "fa-sun" };
    if (code >= 1 && code <= 3) return { label: "Partly Cloudy", icon: "fa-cloud-sun" };
    if (code === 45 || code === 48) return { label: "Foggy", icon: "fa-smog" };
    if (code >= 51 && code <= 55) return { label: "Drizzle", icon: "fa-cloud-rain" };
    if (code >= 61 && code <= 65) return { label: "Rainy", icon: "fa-cloud-showers-heavy" };
    if (code >= 71 && code <= 77) return { label: "Snow", icon: "fa-snowflake" };
    if (code >= 80 && code <= 82) return { label: "Showers", icon: "fa-cloud-showers-water" };
    if (code >= 95 && code <= 99) return { label: "Thunderstorm", icon: "fa-bolt" };

    return { label: "Unknown", icon: "fa-cloud" };
}

// UI Helpers
function showLoading() {
    loading.classList.remove("hidden");
    weatherData.classList.add("hidden");
    errorMessage.classList.add("hidden");
}

function hideLoading(success = true) {
    loading.classList.add("hidden");
    if (success) {
        weatherData.classList.remove("hidden");
    }
}

function showError(msg) {
    errorMessage.innerText = msg;
    errorMessage.classList.remove("hidden");
    loading.classList.add("hidden");
}
