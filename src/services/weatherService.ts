/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WeatherForecast {
  time: string[];
  windSpeed: number[];
  precipitation: number[];
}

export async function fetchWeatherForecast(lat: number = 35.2, lon: number = -75.5): Promise<WeatherForecast> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,precipitation&forecast_days=3`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    return {
      time: data.hourly.time,
      windSpeed: data.hourly.wind_speed_10m,
      precipitation: data.hourly.precipitation,
    };
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    // Fallback to empty data
    return { time: [], windSpeed: [], precipitation: [] };
  }
}
