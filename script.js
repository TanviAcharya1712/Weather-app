const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const errorMsg = document.getElementById('error-msg');
const loadingSpinner = document.getElementById('loading-spinner');
const contentWrapper = document.getElementById('content-wrapper');

// UI Elements to update
const cityNameEl = document.getElementById('city-name');
const countryCodeEl = document.getElementById('country-code');
const pincodeEl = document.getElementById('pincode');
const tempEl = document.getElementById('temperature');
const conditionTextEl = document.getElementById('condition-text');
const weatherIconEl = document.getElementById('weather-icon');
const googleMapEl = document.getElementById('google-map');

// New Details UI Elements, mapped by ID
const detailsEls = {
    feelsLike: document.getElementById('feels-like'),
    humidity: document.getElementById('humidity'),
    windSpeed: document.getElementById('wind-speed'),
    windDir: document.getElementById('wind-dir'),
    windGusts: document.getElementById('wind-gusts'),
    pressure: document.getElementById('pressure'),
    visibility: document.getElementById('visibility'),
    uvIndex: document.getElementById('uv-index'),
    cloudCover: document.getElementById('cloud-cover'),
    precipitation: document.getElementById('precipitation'),
    dewPoint: document.getElementById('dew-point'),
    sunrise: document.getElementById('sunrise'),
    sunset: document.getElementById('sunset'),
    aqiValue: document.getElementById('aqi-value'),
    aqiStatus: document.getElementById('aqi-status'),
    ozoneValue: document.getElementById('ozone-value')
};

searchBtn.addEventListener('click', () => {
    const input = cityInput.value.trim();
    if (input) {
        handleSearch(input);
    }
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const input = cityInput.value.trim();
        if (input) {
            handleSearch(input);
        }
    }
});

async function handleSearch(input) {
    // Reset UI
    errorMsg.textContent = '';
    contentWrapper.style.display = 'none';
    loadingSpinner.style.display = 'block';

    try {
        let geoData = null;

        // 1. Detect Input Type: Pincode or City
        const isPincode = /^\s*\d{4,10}\s*$/.test(input);

        if (isPincode) {
            geoData = await getCoordinatesByPincode(input.trim());
        } else {
            geoData = await getCoordinatesByCity(input);
        }

        if (!geoData) {
            throw new Error(`Location "${input}" not found. Try a different name or pincode.`);
        }

        // 1.5. Nearest Village/Data Fallback
        // If pincode is missing OR if the location seems generic, fetch nearest village data.
        if (!geoData.postcodes || geoData.postcodes.length === 0) {
            const nearestData = await fetchReverseGeoDetails(geoData.latitude, geoData.longitude);
            if (nearestData) {
                // Update Pincode
                if (nearestData.postcode) {
                    geoData.postcodes = [nearestData.postcode];
                }

                // Optional: Update name if the original was vague or just a search term
                // If the searched name was found in the "nearest" data, it's good.
                // If not, we found a "more specific" or "nearest" village.
                // We append it to be helpful, e.g., "Mudhala (near Padra)" or just update it.
                // User said: "show nearest village data".
                // If we didn't have a pincode before, this 'nearestData.name' is likely the place that has the pincode.
                if (nearestData.name && nearestData.name !== geoData.name) {
                    // Keep original name but add nearest village context if different
                    geoData.name = `${geoData.name} (${nearestData.name})`;
                }
            }
        }

        // 2. Fetch all weather data
        const [weatherData, aqiData] = await Promise.all([
            getWeather(geoData.latitude, geoData.longitude),
            getAirQuality(geoData.latitude, geoData.longitude)
        ]);

        // 3. Update UI
        updateUI(geoData, weatherData, aqiData);

    } catch (error) {
        console.error(error);
        errorMsg.textContent = error.message || "An error occurred fetching data.";
        loadingSpinner.style.display = 'none';
    }
}

// Strategy 1: Pincode Search
async function getCoordinatesByPincode(pincode) {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}&format=json&addressdetails=1&limit=1`;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'ElegantWeatherApp/1.0' } });
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            return {
                name: result.address.city || result.address.town || result.address.village || result.display_name.split(',')[0],
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                country_code: result.address.country_code ? result.address.country_code.toUpperCase() : '',
                postcodes: [pincode]
            };
        }
        return null;
    } catch (e) {
        console.warn('Nominatim Pincode Search failed', e);
        return null;
    }
}

// Strategy 2: City Search
async function getCoordinatesByCity(city) {
    // Layer A: Open-Meteo
    try {
        const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const omResponse = await fetch(omUrl);
        const omData = await omResponse.json();
        if (omData.results && omData.results.length > 0) {
            return omData.results[0];
        }
    } catch (e) { }

    // Layer B: Nominatim Fallback
    try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&addressdetails=1&limit=1`;
        const nomResponse = await fetch(nomUrl, { headers: { 'User-Agent': 'ElegantWeatherApp/1.0' } });
        const nomData = await nomResponse.json();

        if (nomData && nomData.length > 0) {
            const result = nomData[0];
            const addr = result.address;
            const name = addr.city || addr.town || addr.village || addr.suburb || result.display_name.split(',')[0];
            return {
                name: name,
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                country_code: addr.country_code ? addr.country_code.toUpperCase() : '',
                postcodes: addr.postcode ? [addr.postcode] : []
            };
        }
    } catch (e) {
        console.warn('Nominatim Fallback failed', e);
    }
    return null;
}

// Enhanced Reverse Geocoding (Nearest Village Fallback)
async function fetchReverseGeoDetails(lat, lon) {
    // Nominatim Reverse is best for "Nearest Village" logic
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'ElegantWeatherApp/1.0' } });
        const data = await response.json();

        if (data && data.address) {
            const addr = data.address;
            // Prioritize specific locality names
            const name = addr.village || addr.town || addr.city || addr.suburb || addr.hamlet;
            return {
                name: name,
                postcode: addr.postcode
            };
        }
        return null;
    } catch (e) {
        console.warn('Reverse Geocoding failed', e);
        return null;
    }
}

async function getWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m&hourly=visibility,uv_index&daily=sunrise,sunset&timezone=auto&wind_speed_unit=kmh`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather service unavailable.');
    return await response.json();
}

async function getAirQuality(lat, lon) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,ozone`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Air quality service unavailable.');
    return await response.json();
}

function updateUI(geoLocation, weatherData, aqiData) {
    const current = weatherData.current;

    cityNameEl.textContent = geoLocation.name || 'Unknown Location';
    countryCodeEl.textContent = geoLocation.country_code || '--';

    // Robust Pincode
    if (geoLocation.postcodes && geoLocation.postcodes.length > 0) {
        pincodeEl.textContent = geoLocation.postcodes[0];
    } else {
        pincodeEl.textContent = 'Unavailable';
    }

    tempEl.textContent = Math.round(current.temperature_2m);

    const wmoCode = current.weather_code;
    const isDay = current.is_day === 1;
    const condition = getWeatherCondition(wmoCode, isDay);
    conditionTextEl.textContent = condition.text;
    weatherIconEl.className = `weather-icon fa-solid ${condition.icon}`;

    detailsEls.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;
    detailsEls.humidity.textContent = `${current.relative_humidity_2m}%`;
    detailsEls.windSpeed.textContent = `${current.wind_speed_10m} km/h`;
    detailsEls.windDir.textContent = `${current.wind_direction_10m}°`;
    detailsEls.windGusts.textContent = `${current.wind_gusts_10m} km/h`;
    detailsEls.pressure.textContent = `${current.pressure_msl} hPa`;
    detailsEls.cloudCover.textContent = `${current.cloud_cover}%`;
    detailsEls.precipitation.textContent = `${current.precipitation} mm`;
    detailsEls.dewPoint.textContent = `${current.dew_point_2m.toFixed(1)}°C`;

    const currentHourISO = current.time.substring(0, 13);
    let hourIndex = weatherData.hourly.time.findIndex(t => t.startsWith(currentHourISO));
    if (hourIndex === -1) hourIndex = 0;

    const visMeters = weatherData.hourly.visibility[hourIndex];
    detailsEls.visibility.textContent = `${(visMeters / 1000).toFixed(1)} km`;

    const uvIndex = weatherData.hourly.uv_index[hourIndex];
    detailsEls.uvIndex.textContent = uvIndex !== undefined ? uvIndex.toFixed(1) : '--';

    if (weatherData.daily && weatherData.daily.sunrise.length > 0) {
        detailsEls.sunrise.textContent = formatTime(weatherData.daily.sunrise[0]);
        detailsEls.sunset.textContent = formatTime(weatherData.daily.sunset[0]);
    }

    if (aqiData && aqiData.current) {
        const aqi = aqiData.current.us_aqi;
        const ozone = aqiData.current.ozone;
        detailsEls.aqiValue.textContent = aqi;
        detailsEls.ozoneValue.textContent = `${ozone} µg/m³`;
        const aqiInfo = getAQIStatus(aqi);
        detailsEls.aqiStatus.textContent = aqiInfo.label;
        detailsEls.aqiStatus.className = `badge ${aqiInfo.class}`;
    }

    googleMapEl.src = `https://www.google.com/maps?q=${geoLocation.latitude},${geoLocation.longitude}&output=embed&z=12`;

    loadingSpinner.style.display = 'none';
    contentWrapper.style.display = 'block';
}

function formatTime(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAQIStatus(aqi) {
    if (aqi <= 50) return { label: 'Good', class: 'good' };
    if (aqi <= 100) return { label: 'Moderate', class: 'moderate' };
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups', class: 'unhealthy-sensitive' };
    if (aqi <= 200) return { label: 'Unhealthy', class: 'unhealthy' };
    if (aqi <= 300) return { label: 'Very Unhealthy', class: 'very-unhealthy' };
    return { label: 'Hazardous', class: 'hazardous' };
}

function getWeatherCondition(code, isDay) {
    const iconSuffix = isDay ? 'sun' : 'moon';
    if (code === 0) return { text: 'Clear Sky', icon: isDay ? 'fa-sun' : 'fa-moon' };
    if (code === 1) return { text: 'Mainly Clear', icon: isDay ? 'fa-cloud-sun' : 'fa-cloud-moon' };
    if (code === 2) return { text: 'Partly Cloudy', icon: 'fa-cloud' };
    if (code === 3) return { text: 'Overcast', icon: 'fa-cloud' };
    if (code === 45 || code === 48) return { text: 'Fog', icon: 'fa-smog' };
    if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: 'fa-cloud-rain' };
    if (code >= 61 && code <= 67) return { text: 'Rain', icon: 'fa-umbrella' };
    if (code >= 71 && code <= 77) return { text: 'Snow', icon: 'fa-snowflake' };
    if (code >= 80 && code <= 82) return { text: 'Showers', icon: 'fa-cloud-showers-heavy' };
    if (code >= 85 && code <= 86) return { text: 'Snow Showers', icon: 'fa-snowflake' };
    if (code >= 95) return { text: 'Thunderstorm', icon: 'fa-bolt' };
    return { text: 'Unknown', icon: 'fa-cloud' };
}
