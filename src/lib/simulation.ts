/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Consumer {
  id: string;
  type: 'Hospital' | 'School' | 'Shop' | 'Hotel' | 'Residential';
  baseLoad: number; // Watts
  priority: number; // 1 (Highest) to 4 (Lowest)
  currentDemand: number;
  satisfiedPower: number;
}

export interface SwarmAgent {
  id: string;
  type: 'solar' | 'wind' | 'biomass' | 'storage';
  capacity: number;
  currentOutput: number;
  status: 'active' | 'limited' | 'failed';
  position: [number, number, number]; // [x, y, z] for communication visualization
  communicationRange: number;
}

export interface SimulationState {
  time: number;
  solarPower: number;
  windPower: number;
  biomassPower: number;
  loadPower: number;
  actualDeliveredPower: number;
  totalAvailablePower: number;
  netPower: number;
  gridFrequency: number;
  mxeneSoC: number;
  mxenePower: number;
  gravityEnergy: number;
  gravityMode: 'standby' | 'charging' | 'discharging';
  gravityPower: number;
  shadingFactor: number;
  vibrationAmplitude: number;
  tengHarvestedPower: number;
  tengVoltage: number;
  anomalyStatus: boolean;
  affectedComponent: string | null;
  anomalyExplanation: string | null;
  cusumValue: number;
  cusumConfirmedTimestep: number | null;
  consumers: Consumer[];
  isManualMode: boolean;
  stormSeverity: number;
  isProactiveCharging: boolean;
  swarmAgents: SwarmAgent[];
  swarmConsensusStatus: 'stable' | 'negotiating' | 'rebalancing';
  forecast: {
    time: number;
    windSpeed: number;
    stormSeverity: number;
  }[];
}

export class TENG_Sensor {
  /**
   * Triboelectric Nanogenerator (TENG) Sensor Mathematical Model
   * 
   * The open-circuit voltage $V_{OC}$ for a contact-separation mode TENG is modeled based on the 
   * parallel plate capacitor model with time-varying gap $x(t)$:
   * 
   * $$V_{OC}(t) = \frac{\sigma \cdot x(t)}{\epsilon_0}$$
   * 
   * The short-circuit current $I_{SC}(t)$ is obtained by differentiating the induced charge 
   * $Q(t) = \frac{S \sigma d_0}{d_0 + x(t)}$ with respect to time:
   * 
   * $$I_{SC}(t) = \frac{dQ}{dt} = \frac{S \sigma d_0}{(d_0 + x(t))^2} \cdot \frac{dx}{dt}$$
   * 
   * For contact-separation mode, the derivation of the governing equation for power generation 
   * under a load resistance $R$ follows from Ohm's law and the capacitor model:
   * 
   * $$R \cdot \frac{dQ}{dt} = V = -\frac{Q}{C} + V_{OC} = -\frac{Q(d_0 + x(t))}{S \epsilon_0} + \frac{\sigma x(t)}{\epsilon_0}$$
   * 
   * where:
   * - $\sigma$ [$C/m^2$]: Surface charge density of the tribo-materials.
   * - $x(t)$ [$m$]: Time-varying displacement (vibration amplitude).
   * - $\epsilon_0$: Permittivity of free space ($\approx 8.854 \times 10^{-12} F/m$).
   * - $S$ [$m^2$]: Effective contact area of the sensor.
   * - $d_0$ [$m$]: Effective dielectric thickness / initial gap.
   */
  private threshold = 2.5; // mm
  private sigma = 50e-6; // Surface charge density
  private epsilon0 = 8.854e-12;
  private S = 0.01; // Surface area
  private d0 = 0.001; // Initial gap

  update(windSpeed: number, dt: number) {
    // Simulated vibration amplitude based on wind speed (non-linear)
    const vibrationAmplitude = 0.5 * Math.pow(windSpeed / 6, 2) + (Math.random() - 0.5) * 0.2;
    
    // Open-circuit voltage: Voc = (sigma * x) / epsilon0
    const tengVoltage = (this.sigma * (vibrationAmplitude * 1e-3)) / this.epsilon0;
    
    // Simplified harvested power (microwatts)
    const harvestedPower = Math.abs(tengVoltage * 1e-6 * vibrationAmplitude); 
    
    const anomaly = vibrationAmplitude > this.threshold;
    
    return {
      vibrationAmplitude,
      harvestedPower,
      tengVoltage,
      anomaly
    };
  }
}

export class SolarSource {
  /**
   * Solar Power Generation with Golden Ratio (Fermat Spiral) Optimization
   * 
   * The sun-tracking Fermat Spiral layout for a heliostat/panel field minimizes 
   * mutual shading and blocking losses. The layout coordinates $(r, \theta)$ are:
   * 
   * $$r_n = c\sqrt{n}, \quad \theta_n = n \times 137.508^\circ$$
   * 
   * The effective solar area $A_{eff}$ is calculated as:
   * 
   * $$A_{eff} = A_{panel} \times \left(1 - \text{ShadingFactor}(\phi)\right)$$
   * 
   * The Shading Factor $\mathcal{S}(\phi)$ is derived based on the geometry of shadows cast 
   * by adjacent panels in the spiral. For a panel of height $h$ and a solar altitude 
   * angle $\phi$, the shadow length $L = h \cot(\phi)$. The overlap with the 
   * next panel at distance $d$ gives the shading fraction:
   * 
   * $$\mathcal{S}(\phi) = \max\left(0, 1 - \frac{d}{h \cot(\phi)}\right) = \max\left(0, 1 - \frac{d}{h \tan(90^\circ - \phi)}\right)$$
   * 
   * The overall efficiency gain $\eta_{layout}$ compared to a rectangular grid is:
   * 
   * $$\eta_{layout} = \eta_{base} \times (1 + \alpha \ln(1 + \cos(\theta_{sun})))$$
   * 
   * where $\theta_{sun}$ is the angle of incidence.
   * 
   * mapping to simulation variables:
   * - `irradiance` $\rightarrow G(t)$ [$W/m^2$]
   * - `sunAngle` $\rightarrow \phi$ [rad]
   * - `shadingFactor` $\rightarrow \mathcal{S}_{ext}(t)$ [0-1]
   */
  private area = 50;
  private etaBase = 0.20;
  private alpha = 0.12; // Golden Ratio layout gain factor

  getPower(irradiance: number, sunAngle: number, externalShading: number = 0) {
    // Fermat Spiral / Golden Ratio layout efficiency gain
    // eta_layout = eta_base * (1 + alpha * log(1 + cos(theta_sun)))
    const cosTheta = Math.max(0, Math.cos(sunAngle));
    const etaLayout = this.etaBase * (1 + this.alpha * Math.log(1 + cosTheta));
    
    // Total power considering external shading impact
    // P = A * G * eta * (1 - S_ext)
    return this.area * irradiance * etaLayout * (1 - externalShading);
  }
}

export class WindSource {
  private rho = 1.225;
  private areaStd = 25;
  private cpStd = 0.4;
  private areaLeaf = 2;
  private cpLeaf = 0.25;
  private nLeaf = 10;
  public teng = new TENG_Sensor();

  getPower(windSpeed: number) {
    // Standard Turbine: Cubic power curve
    const pStd = 0.5 * this.rho * this.areaStd * this.cpStd * Math.pow(windSpeed, 3);
    
    // Leaf-inspired Low-wind Turbine: Flatter curve
    const pLeaf = windSpeed < 8 ? 0.5 * this.rho * this.areaLeaf * this.cpLeaf * Math.pow(windSpeed, 2) : 0;
    
    return Math.max(0, pStd) + (this.nLeaf * pLeaf);
  }
}

export class MXeneSupercapacitor {
  /**
   * MXene-based Supercapacitor Physical Dynamics
   * 
   * MXene supercapacitors exhibit high pseudocapacitance and fast ion transport. 
   * The charge dynamics are modeled using an equivalent RC circuit:
   * 
   * The State of Charge (SoC) evolution follows the integration of current over time:
   * 
   * $$SoC(t) = SoC(t_0) + \frac{1}{E_{rated}} \int_{t_0}^{t} \left( P_{mxene}(\tau) - P_{loss}(\tau) \right) d\tau$$
   * 
   * Power loss $P_{loss}$ due to the Equivalent Series Resistance (ESR) is modeled as:
   * 
   * $$P_{loss}(t) = I(t)^2 \cdot R_{ESR} = \left(\frac{P_{mxene}(t)}{V(t)}\right)^2 \cdot R_{ESR}$$
   * 
   * mapping to simulation variables:
   * - `soc` $\rightarrow SoC(t)$
   * - `mxenePower` $\rightarrow P_{mxene}(t) = V(t) \cdot I(t)$
   */
  public soc = 0.5; // 50% initial
  private capacityWh = 5000;
  private maxPowerW = 20000;
  private rESR = 0.05;

  charge(power: number, dt: number) {
    const actualPower = Math.min(power, this.maxPowerW);
    const energyAdded = (actualPower * (dt / 3600));
    this.soc = Math.min(1, this.soc + energyAdded / this.capacityWh);
    return actualPower;
  }

  discharge(power: number, dt: number) {
    const actualPower = Math.min(power, this.maxPowerW);
    const energyRemoved = (actualPower * (dt / 3600));
    if (this.soc * this.capacityWh >= energyRemoved) {
      this.soc -= energyRemoved / this.capacityWh;
      return actualPower;
    }
    const availablePower = (this.soc * this.capacityWh) / (dt / 3600);
    this.soc = 0;
    return availablePower;
  }
}

export class GravityBattery {
  public energyWh = 25000; // 25kWh initial
  private capacityWh = 50000;
  public mode: 'standby' | 'charging' | 'discharging' = 'standby';

  charge(power: number, dt: number) {
    this.mode = 'charging';
    const energyAdded = (power * (dt / 3600));
    this.energyWh = Math.min(this.capacityWh, this.energyWh + energyAdded);
    return power;
  }

  discharge(power: number, dt: number) {
    this.mode = 'discharging';
    const energyRemoved = (power * (dt / 3600));
    if (this.energyWh >= energyRemoved) {
      this.energyWh -= energyRemoved;
      return power;
    }
    const available = this.energyWh;
    this.energyWh = 0;
    return available / (dt / 3600);
  }
}

export class SimulationEngine {
  /**
   * Smart Grid Simulation Environment with AI Neighborhood Management
   * 
   * The AI Dispatcher prioritizes power distribution based on consumer critical status:
   * 1. Hospitals (Tier 1) - Life support and emergency services.
   * 2. Schools/Colleges (Tier 2) - Educational continuity.
   * 3. Shops/Hotels (Tier 3) - Economic activity.
   * 4. Residential (Tier 4) - Basic domestic needs.
   * 
   * Grid frequency stability is governed by the rotational inertia of the system. 
   * The frequency dynamics $f(t)$ are modeled via the standard Swing Equation derived from 
   * Newton's second law for rotation:
   * 
   * $$J \omega \frac{d\omega}{dt} = P_m(t) - P_e(t)$$
   * 
   * Normalizing by the machine power rating $S_n$, we obtain the per-unit swing equation:
   * 
   * $$\frac{2H}{\omega_s} \frac{d\Delta\omega}{dt} = P_m(pu) - P_e(pu) - D\Delta\omega$$
   * 
   * where:
   * - $H$ is the inertia constant [s].
   * - $P_m$ is the mechanical power input (total generation).
   * - $P_e$ is the electrical power output (load + losses).
   * - $D$ is the damping coefficient.
   * - $\Delta\omega = \omega - \omega_s$ is the frequency deviation.
   * 
   * mapping to simulation variables:
   * - `gridFrequency` $\rightarrow f(t) = \frac{\omega(t)}{2\pi}$ [Hz]
   * - `netPower` $\rightarrow P_m(t) - P_e(t)$ [W]
   */
  private dt = 3600; // 1 hour steps for 48h simulation
  private solar = new SolarSource();
  private wind = new WindSource();
  private mxene = new MXeneSupercapacitor();
  private gravity = new GravityBattery();
  
  private h = 5.0; // Inertia
  private fBase = 60;
  private currentFreq = 60;

  private cusumG = 0;
  private cusumK = 0.5;
  private cusumMu0 = 1.0;
  private cusumH = 10.0;
  private confirmationTimestep: number | null = null;

  private consumers: Consumer[] = [
    { id: 'hosp-1', type: 'Hospital', baseLoad: 15000, priority: 1, currentDemand: 0, satisfiedPower: 0 },
    { id: 'school-1', type: 'School', baseLoad: 12000, priority: 2, currentDemand: 0, satisfiedPower: 0 },
    { id: 'shop-1', type: 'Shop', baseLoad: 8000, priority: 3, currentDemand: 0, satisfiedPower: 0 },
    { id: 'hotel-1', type: 'Hotel', baseLoad: 10000, priority: 3, currentDemand: 0, satisfiedPower: 0 },
    { id: 'res-1', type: 'Residential', baseLoad: 15000, priority: 4, currentDemand: 0, satisfiedPower: 0 },
    { id: 'res-2', type: 'Residential', baseLoad: 15000, priority: 4, currentDemand: 0, satisfiedPower: 0 },
  ];

  public manualAllocations: Record<string, number> = {};
  public isManualMode = false;

  private agents: SwarmAgent[] = [
    { id: 'solar-a', type: 'solar', capacity: 20000, currentOutput: 0, status: 'active', position: [-5, 0, 0], communicationRange: 3 },
    { id: 'solar-b', type: 'solar', capacity: 20000, currentOutput: 0, status: 'active', position: [-4, 0, 1], communicationRange: 3 },
    { id: 'wind-a', type: 'wind', capacity: 25000, currentOutput: 0, status: 'active', position: [4, 0, 0], communicationRange: 4 },
    { id: 'wind-b', type: 'wind', capacity: 25000, currentOutput: 0, status: 'active', position: [5, 0, 2], communicationRange: 4 },
    { id: 'bio-a', type: 'biomass', capacity: 8000, currentOutput: 0, status: 'active', position: [0, 0, -4], communicationRange: 6 },
    { id: 'bio-b', type: 'biomass', capacity: 7000, currentOutput: 0, status: 'active', position: [1, 0, -5], communicationRange: 6 },
    { id: 'storage-a', type: 'storage', capacity: 5000, currentOutput: 0, status: 'active', position: [-2, 0, -6], communicationRange: 5 },
  ];

  smartDispatch(availablePower: number, consumers: Consumer[]): { delivered: number, updatedConsumers: Consumer[] } {
    let remaining = availablePower;
    let totalDelivered = 0;

    if (this.isManualMode) {
      // Manual Mode: Use provided allocations if possible, otherwise scale down
      const updated = consumers.map(c => {
        const requested = this.manualAllocations[c.id] ?? 0;
        const delivered = Math.min(remaining, requested);
        remaining -= delivered;
        totalDelivered += delivered;
        return { ...c, satisfiedPower: delivered };
      });
      return { delivered: totalDelivered, updatedConsumers: updated };
    }

    // AI/Auto Mode: Sort by priority (1 is highest)
    const sorted = [...consumers].sort((a, b) => a.priority - b.priority);

    const updated = sorted.map(c => {
      const demand = c.currentDemand;
      const delivered = Math.min(remaining, demand);
      remaining -= delivered;
      totalDelivered += delivered;
      return { ...c, satisfiedPower: delivered };
    });

    return { delivered: totalDelivered, updatedConsumers: updated };
  }

  private weatherData: { windSpeed: number[], stormSeverity: number[] } | null = null;

  setExternalWeatherData(windSpeeds: number[], precipitation: number[]) {
    // Map precipitation to storm severity (0-1)
    const stormSeverity = precipitation.map(p => Math.min(1, p / 10)); // 10mm/h as max severity
    this.weatherData = { windSpeed: windSpeeds, stormSeverity };
  }

  generateProfiles(hours: number) {
    const profiles = [];
    for (let t = 0; t < hours; t++) {
      // Solar Irradiance: Gaussian peak at noon
      const hourOfDay = t % 24;
      const irradiance = 1000 * Math.exp(-Math.pow(hourOfDay - 12, 2) / 16);
      const sunAngle = (Math.PI * (hourOfDay - 6)) / 12;

      // Wind Speed: Use external data if available, else random walk
      let windSpeed = this.weatherData 
        ? (this.weatherData.windSpeed[t] || 6) 
        : (6 + Math.sin(t / 4) * 2 + (Math.random() - 0.5) * 2);
      
      // GRID FAILURE SCENARIO: t=38 to 44
      let bioPowerOverride = 15000;
      if (t >= 38 && t <= 44) {
        bioPowerOverride = 2000;
        windSpeed = windSpeed > 10 ? windSpeed : 1;
      }

      // STORM SCENARIO: Use external data if available
      let stormSeverity = this.weatherData 
        ? (this.weatherData.stormSeverity[t] || 0)
        : 0;
        
      if (!this.weatherData && t >= 18 && t <= 30) {
        // Fallback simulation storm if no API data
        stormSeverity = Math.exp(-Math.pow(t - 24, 2) / 8);
        windSpeed += stormSeverity * 15;
      }

      if (t >= 30 && t <= 34) windSpeed += 6; 

      // Load Profile: Double hump
      const baseLoadValue = 15000 + 5000 * Math.sin((Math.PI * (hourOfDay - 8)) / 6) + 3000 * Math.sin((Math.PI * (hourOfDay - 18)) / 4);

      // Smart AI Load Management: Assign dynamic demand to neighborhood
      let totalNeighborhoodDemand = 0;
      this.consumers.forEach(c => {
        // Apply sinusoidal variation to base load
        const variation = 1 + 0.3 * Math.sin((Math.PI * (hourOfDay - 12)) / 12);
        c.currentDemand = c.baseLoad * variation;
        totalNeighborhoodDemand += c.currentDemand;
      });

      profiles.push({ t, irradiance, sunAngle, windSpeed, load: totalNeighborhoodDemand, bioPower: bioPowerOverride, stormSeverity });
    }
    return profiles;
  }

  run(hours: number = 48): SimulationState[] {
    const profiles = this.generateProfiles(hours);
    const results: SimulationState[] = [];
    
    this.mxene.soc = 0.5;
    this.gravity.energyWh = 25000;
    this.currentFreq = 60;
    this.cusumG = 0;
    this.confirmationTimestep = null;

    for (const p of profiles) {
      // Simulate external shading factor
      const hour = p.t % 24;
      let shading = 0;
      if (hour < 8 || hour > 17) {
        shading = 0.3 * Math.abs(Math.sin(p.t / 2));
      }
      if (Math.random() > 0.9) shading += 0.4;
      
      // Storm clouds increase shading
      shading += (p.stormSeverity ?? 0) * 0.6;
      shading = Math.min(1, shading);

      // Swarm Optimization: Nodes negotiate based on local drops
      let nextConsensus: 'stable' | 'negotiating' | 'rebalancing' = 'stable';
      
      // Distributed Generation Calculation (Swarm Agents)
      let totalSwarmGen = 0;
      for (const agent of this.agents) {
        // Dynamic Failure Logic: Risk increases with storm severity
        const stormRisk = (p.stormSeverity ?? 0) * 0.15; // Up to 15% risk at max storm
        const limitedRisk = (p.stormSeverity ?? 0) * 0.3; // Up to 30% risk of performance drop
        const baseRandomRisk = 0.005; // 0.5% baseline hourly risk
        
        if (agent.status === 'active') {
          if (Math.random() < (stormRisk + baseRandomRisk)) {
            agent.status = 'failed';
          } else if (Math.random() < limitedRisk) {
            agent.status = 'limited';
          }
        } else if (agent.status === 'failed' || agent.status === 'limited') {
          // Probabilistic recovery (remote reset or self-healing)
          // Recovery is harder during storms
          const recoveryChance = agent.status === 'limited' ? 0.4 : 0.2 * (1 - (p.stormSeverity ?? 0));
          if (Math.random() < recoveryChance) {
            agent.status = 'active';
          }
        }

        // Hardcoded Critical Scenario: Bio-A major fault
        if (p.t >= 38 && p.t <= 44 && agent.id === 'bio-a') {
          agent.status = 'failed';
        }

        if (agent.status === 'failed') {
          agent.currentOutput = 0;
          nextConsensus = 'negotiating';
        } else {
          // Normal or limited calculation
          let outputFactor = agent.status === 'limited' ? 0.5 : 1.0;
          
          if (agent.type === 'solar') {
            agent.currentOutput = this.solar.getPower(p.irradiance / 2, p.sunAngle, shading) * outputFactor;
          } else if (agent.type === 'wind') {
            agent.currentOutput = (this.wind.getPower(p.windSpeed) / 2) * outputFactor;
          } else if (agent.type === 'biomass') {
            agent.currentOutput = ((p.bioPower ?? 15000) / 2) * outputFactor;
          }
        }
        
        totalSwarmGen += agent.currentOutput;
      }

      if (nextConsensus === 'negotiating') {
        const dist = (p1: [number, number, number], p2: [number, number, number]) => 
          Math.sqrt(Math.pow(p1[0]-p2[0],2) + Math.pow(p1[1]-p2[1],2) + Math.pow(p1[2]-p2[2],2));

        // Nodes within communication range detect and help the most critical failure
        const failedNodes = this.agents.filter(a => a.status !== 'active');
        
        for (const failed of failedNodes) {
          const neighbors = this.agents.filter(a => 
            a.id !== failed.id && 
            a.status === 'active' && 
            dist(a.position, failed.position) <= a.communicationRange
          );
          
          if (neighbors.length > 0) {
            // Neighbors boost output by up to 20% collectively but capped by their capacity
            const helpAmount = (failed.capacity * 0.1) / neighbors.length; 
            for (const n of neighbors) {
              const boost = Math.min(helpAmount, n.capacity - n.currentOutput);
              n.currentOutput += boost;
              totalSwarmGen += boost;
            }
            nextConsensus = 'rebalancing';
          }
        }
      }

      const pSolar = this.agents.filter(a => a.type === 'solar').reduce((acc, a) => acc + a.currentOutput, 0);
      const pWind = this.agents.filter(a => a.type === 'wind').reduce((acc, a) => acc + a.currentOutput, 0);
      const pBio = this.agents.filter(a => a.type === 'biomass').reduce((acc, a) => acc + a.currentOutput, 0);
      
      const pGen = totalSwarmGen;
      const consensusStatus = nextConsensus;
      
      // Calculate Potential Supply from Storage + Generation
      let storagePotential = 0;
      // MXene can discharge at max 20kW if SoC allows
      storagePotential += Math.min(20000, (this.mxene.soc * 5000) / (this.dt / 3600));
      // Gravity can discharge if needed
      storagePotential += Math.min(10000, this.gravity.energyWh / (this.dt / 3600));

      const totalAvailable = pGen + storagePotential;
      
      // AI Smart Dispatch
      const { delivered, updatedConsumers } = this.smartDispatch(totalAvailable, this.consumers);
      this.consumers = updatedConsumers;

      // Net power for storage update: use actual balance
      const balance = pGen - delivered;
      
      let mxeneP = 0;
      let gravP = 0;
      this.gravity.mode = 'standby';

      // PROACTIVE AI LOGIC: Look ahead 6 hours
      const forecastWindow = profiles.slice(profiles.indexOf(p) + 1, profiles.indexOf(p) + 7);
      const stormPredicted = forecastWindow.some(f => (f.stormSeverity || 0) > 0.5);
      const isProactiveCharging = stormPredicted && this.mxene.soc < 0.9;

      if (balance > 0 || isProactiveCharging) {
        // Surplus or Proactive: Charge storage
        const chargePower = isProactiveCharging ? Math.max(balance, 10000) : balance;
        mxeneP = -this.mxene.charge(chargePower, this.dt);
        const remainingSurplus = chargePower + mxeneP;
        if (remainingSurplus > 5000) {
          gravP = -this.gravity.charge(remainingSurplus, this.dt);
        }
      } else {
        // Deficit: Discharge storage
        const deficit = Math.abs(balance);
        mxeneP = this.mxene.discharge(deficit, this.dt);
        const remainingDeficit = deficit - mxeneP;
        if (remainingDeficit > 0) {
          gravP = this.gravity.discharge(remainingDeficit, this.dt);
        }
      }

      // Frequency Dynamics
      const pNet = pGen - p.load; // Theoretical net for analytics
      const imbalance = pGen - delivered - mxeneP - gravP; 
      const df = (imbalance / 50000) * (1 / (2 * this.h));
      this.currentFreq += df;
      this.currentFreq = Math.max(59, Math.min(61, this.currentFreq));

      // TENG Signal Processing
      const vibrationScale = (p.stormSeverity ?? 0) > 0 ? 1.5 + (p.stormSeverity ?? 0) : 1.0;
      const tengData = this.wind.teng.update(p.windSpeed, this.dt * vibrationScale);
      
      /**
       * CUSUM (Cumulative Sum) Anomaly Detection Algorithm
       * 
       * The CUSUM chart is a sequential analysis technique used for monitoring change detection.
       * The recursive calculation is defined as:
       * 
       * $$g_t = \max(0, g_{t-1} + (x_t - \mu_0) - k)$$
       * 
       * where:
       * - $x_t$ is the current observed vibration amplitude from TENG sensors.
       * - $\mu_0$ is the target/baseline mean amplitude ($\mu_0 = 1.0$).
       * - $k$ is the reference value / slack parameter ($k = 0.5$, usually half of the shift to be detected).
       * - $g_t$ is the cumulative diagnostic signal.
       * 
       * An anomaly is confirmed when $g_t > H$, where $H$ is the decision threshold ($H = 10$).
       */
      this.cusumG = Math.max(0, this.cusumG + tengData.vibrationAmplitude - this.cusumMu0 - this.cusumK);

      const isAnomaly = tengData.anomaly || this.cusumG > this.cusumH;
      
      if (isAnomaly && this.confirmationTimestep === null) {
        this.confirmationTimestep = p.t;
      }

      let affectedComponent = isAnomaly ? "Wind Turbine Array (Blade Fatigue Detected)" : null;
      let anomalyExplanation = isAnomaly 
        ? "Sudden gust induced mechanical fatigue on Wind Turbine B41. TENG sensors detected high frequency vibrations exceeding safety threshold."
        : null;

      if ((p.stormSeverity ?? 0) > 0.5 && isAnomaly) {
        affectedComponent = "Grid Transmission Lines (Storm Damage)";
        anomalyExplanation = "Severe storm conditions (high winds + precipitation) causing line galloping and potential insulator flashover.";
      }

      // Prepare forecast for state
      const currentForecast = profiles.slice(profiles.indexOf(p) + 1, profiles.indexOf(p) + 13).map(f => ({
        time: f.t,
        windSpeed: f.windSpeed,
        stormSeverity: f.stormSeverity ?? 0
      }));

      results.push({
        time: p.t,
        solarPower: pSolar,
        windPower: pWind,
        biomassPower: pBio,
        loadPower: p.load,
        actualDeliveredPower: delivered,
        totalAvailablePower: totalAvailable,
        netPower: pNet,
        gridFrequency: this.currentFreq,
        mxeneSoC: this.mxene.soc,
        mxenePower: mxeneP,
        gravityEnergy: this.gravity.energyWh,
        gravityMode: this.gravity.mode,
        gravityPower: gravP,
        shadingFactor: shading,
        vibrationAmplitude: tengData.vibrationAmplitude,
        tengHarvestedPower: tengData.harvestedPower,
        tengVoltage: tengData.tengVoltage,
        anomalyStatus: isAnomaly,
        affectedComponent,
        anomalyExplanation,
        cusumValue: this.cusumG,
        cusumConfirmedTimestep: this.confirmationTimestep,
        consumers: JSON.parse(JSON.stringify(this.consumers)),
        isManualMode: this.isManualMode,
        stormSeverity: p.stormSeverity ?? 0,
        swarmAgents: JSON.parse(JSON.stringify(this.agents)),
        swarmConsensusStatus: consensusStatus,
        isProactiveCharging,
        forecast: currentForecast
      });
    }

    return results;
  }
}
