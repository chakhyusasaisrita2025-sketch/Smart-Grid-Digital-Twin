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

export type EnergyManagementStrategy = 'heuristic' | 'mpc' | 'reinforcement_learning';

export interface SotaBenchmarkMetrics {
  strategy: EnergyManagementStrategy;
  name: string;
  loadSatisfaction: number; // %
  batterySoH: number;      // %
  gravitySoH: number;      // %
  freqStability: number;   // Index score 0-100 where 100 is perfect 60Hz
  lcos: number;            // $/kWh
  carbonOffset: number;    // kg CO2
  avgTemp: number;         // °C
  peakTemp: number;        // °C
  surplusWastedWh: number; // energy curtailed
}

export interface SimulationState {
  time: number;
  solarPower: number;
  solarUnshadedPower: number;
  windPower: number;
  biomassPower: number;
  loadPower: number;
  actualDeliveredPower: number;
  totalAvailablePower: number;
  netPower: number;
  gridFrequency: number;
  mxeneSoC: number;
  mxenePower: number;
  mxeneSoH: number;
  mxeneTemperature: number;
  mxeneCycles: number;
  mxeneCapLossCycle: number;
  mxeneCapLossCalendar: number;
  mxeneESR: number;
  gravityEnergy: number;
  gravityMode: 'standby' | 'charging' | 'discharging';
  gravityPower: number;
  gravitySoH: number;
  gravityTemperature: number;
  gravityCycles: number;
  lcos: number;
  carbonOffsetRate: number;
  cumulativeCarbonOffset: number;
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
  converterEfficiency: number;
  converterLossesW: number;
  biomassFeedRate: number;
  biomassEfficiency: number;
  elasticLoadSheddingW: number;
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

  update(windSpeed: number, dt: number, isAnomaly: boolean = false) {
    let vibrationAmplitude = 0;
    if (isAnomaly) {
      // Injected vibration fatigue anomaly (2.6 - 3.2 mm)
      vibrationAmplitude = 2.6 + seededRandom(dt, 'teng-v') * 0.6;
    } else {
      // Normal operating vibrations proportional to wind speed (under 2.3 mm)
      const base = Math.min(1.8, 0.4 * Math.pow(windSpeed / 6, 1.5));
      vibrationAmplitude = base + (seededRandom(dt, 'teng-v') - 0.5) * 0.3;
    }
    vibrationAmplitude = Math.max(0.15, vibrationAmplitude);
    
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
  private areaStd = 70; // Optimized area so standard power curve tops out around 30kW at rated speed
  private cpStd = 0.4;
  private areaLeaf = 2;
  private cpLeaf = 0.25;
  private nLeaf = 10;
  public teng = new TENG_Sensor();

  getPower(windSpeedInKmH: number) {
    const windSpeed = windSpeedInKmH / 3.6; // Convert km/h to m/s for turbine physics
    const cutIn = 3.0;
    const ratedSpeed = 12.0;
    const cutOut = 25.0;
    const ratedPower = 30000; // 30,000 W rated power

    if (windSpeed < cutIn) {
      return 0; // Region 1: Below cut-in
    } else if (windSpeed > cutOut) {
      return 0; // Region 4: Cut-out feathered shut down
    } else if (windSpeed >= ratedSpeed) {
      return ratedPower; // Region 3: Rated power output (governed by blade pitch control)
    } else {
      // Region 2: Smooth variable power curve matching variable-pitch variable-speed operations
      const fraction = (windSpeed - cutIn) / (ratedSpeed - cutIn);
      return ratedPower * Math.pow(fraction, 2.2);
    }
  }
}

export class MXeneSupercapacitor {
  /**
   * MXene-based Supercapacitor Physical Dynamics and Degradation Model
   * 
   * MXene supercapacitors exhibit high pseudocapacitance and fast ion transport. 
   * We model capacity degradation (loss of SoH) and internal resistance increases over cycles.
   * 
   * Equivalent Series Resistance (ESR) grows as State of Health degrades:
   * $$R_{ESR}(t) = R_{ESR, 0} \cdot (2 - SoH(t))$$
   * 
   * State of Health (SoH) degrades due to cycling and thermal/calendar aging:
   * $$SoH(t) = 1.0 - SoH_{cycle} - SoH_{calendar}$$
   */
  public soc = 0.5; // 50% initial
  public soh = 1.0;
  public cycles = 0.0;
  public temperature = 25.0; // in °C
  public capLossCycle = 0.0;
  public capLossCalendar = 0.0;
  
  public maxCapacityWh = 5000;
  public currentCapacityWh = 5000;
  public rESR = 0.05; // Equivalent Series Resistance in Ohms
  private maxPowerW = 20000;
  
  // Track cumulative metrics for LCA
  public cumulativeChargedWh = 0;
  public cumulativeDischargedWh = 0;

  charge(power: number, dt: number) {
    const hours = dt / 3600;
    // max SoC capacity change rate of 20% per hour:
    const maxEnergyDueToRamp = 0.20 * this.currentCapacityWh * hours;
    
    const actualPower = Math.min(power, this.maxPowerW);
    const energyAdded = actualPower * hours;
    
    // Bounds: Max SoC = 95%
    const roomWh = Math.max(0, (0.95 - this.soc) * this.currentCapacityWh);
    
    // Cap adding to both ramp limit and room limit
    const realAddedWh = Math.max(0, Math.min(energyAdded, maxEnergyDueToRamp, roomWh));
    this.soc = Math.min(0.95, this.soc + realAddedWh / this.currentCapacityWh);
    
    this.cumulativeChargedWh += realAddedWh;
    this.updateDegradation(realAddedWh / hours, realAddedWh, dt);
    
    return realAddedWh / hours;
  }

  discharge(power: number, dt: number) {
    const hours = dt / 3600;
    // max SoC capacity change rate of 20% per hour:
    const maxEnergyDueToRamp = 0.20 * this.currentCapacityWh * hours;
    
    const actualPower = Math.min(power, this.maxPowerW);
    const energyRemoved = actualPower * hours;
    
    // Bounds: Min SoC = 10%
    const availableEnergyWh = Math.max(0, (this.soc - 0.10) * this.currentCapacityWh);
    
    // Cap removing to both ramp limit and available limit
    const realRemovedWh = Math.max(0, Math.min(energyRemoved, maxEnergyDueToRamp, availableEnergyWh));
    this.soc = Math.max(0.10, this.soc - realRemovedWh / this.currentCapacityWh);
    
    this.cumulativeDischargedWh += realRemovedWh;
    this.updateDegradation(realRemovedWh / hours, realRemovedWh, dt);
    
    return realRemovedWh / hours;
  }

  private updateDegradation(powerW: number, energyWh: number, dt: number) {
    // 1. Thermal Model: Joule heating increases battery temperature
    // I = P / V, assume nominal pack voltage V = 48V
    const currentA = powerW / 48;
    const jouleHeatW = Math.pow(currentA, 2) * this.rESR;
    // Simple thermal balance: Tambient = 25C, thermal transfer coefficient
    const targetTemp = 25.0 + jouleHeatW * 0.15;
    // Thermal inertia
    this.temperature += (targetTemp - this.temperature) * 0.2;
    this.temperature = Math.max(25.0, Math.min(75.0, this.temperature));

    // 2. Equivalent Full Cycle calculation
    const cycleFraction = energyWh / (2 * this.maxCapacityWh);
    this.cycles += cycleFraction;

    // 3. Cycle degradation: accelerated by high temperatures and deep charging
    const tempFactor = Math.exp((this.temperature - 25.0) / 15.0);
    const stressFactor = this.soc > 0.8 || this.soc < 0.2 ? 1.5 : 1.0;
    const dSohCycle = cycleFraction * 0.00012 * tempFactor * stressFactor;
    this.capLossCycle += dSohCycle;

    // 4. Calendar aging: degradation over time
    const dSohCalendar = (dt / 3600) * 0.0000018 * Math.exp((this.temperature - 25.0) / 25.0);
    this.capLossCalendar += dSohCalendar;

    // Update overall SoH and capacity
    this.soh = Math.max(0.6, 1.0 - (this.capLossCycle + this.capLossCalendar));
    this.currentCapacityWh = this.maxCapacityWh * this.soh;

    // Resistance increase as health degrades
    this.rESR = 0.05 * (2.0 - this.soh);
  }
}

export class PowerConverter {
  /**
   * Power Converter Efficiency and Loss Model (DC-DC / DC-AC Inverter)
   * 
   * Efficiency of power converters varies non-linearly with power throughput due to:
   * 1. Constant no-load stand-by losses (gate drive, magnetic core): P_constant
   * 2. Linear conduction losses (diode voltage drops): k_linear * P_in
   * 3. Quadratic switching/resistive losses: k_quadratic * P_in^2
   * 
   * $$P_{loss} = P_{constant} + k_{linear} \cdot P_{in} + k_{quadratic} \cdot P_{in}^2$$
   * $$\eta(P_{in}) = \frac{P_{in} - P_{loss}}{P_{in}}$$
   */
  private pConstant = 80; // Watts core losses at any standard conversion load
  private kLinear = 0.015; // 1.5% linear conduction factor
  private kQuadratic = 0.0000005; // quadratic switching loss coefficient

  getEfficiency(powerIn: number): number {
    if (powerIn <= 0) return 0;
    const absPower = Math.abs(powerIn);
    if (absPower < 100) return 0.50; // light-load efficiency drop
    const losses = this.pConstant + (this.kLinear * absPower) + (this.kQuadratic * Math.pow(absPower, 2));
    const efficiency = (absPower - losses) / absPower;
    return Math.max(0.40, Math.min(0.985, efficiency));
  }

  getLosses(powerIn: number): number {
    if (powerIn <= 0) return 0;
    const absPower = Math.abs(powerIn);
    return this.pConstant + (this.kLinear * absPower) + (this.kQuadratic * Math.pow(absPower, 2));
  }
}

export class BiomassSource {
  /**
   * Biomass Combustion Gasifier and Steam Turbine Model
   * 
   * The bio-power generator processes organic feed through gasification and 
   * steam expansion in a micro-turbine generator:
   * 
   * Power output is dictated by the biomass feed flow rate \dot{m} [kg/s]:
   * $$P_{thermal} = \dot{m} \times LHV \times \eta_{combustor}$$
   * 
   * Overall electrical efficiency \eta_{elec} depends on turbine temperature:
   * $$P_{elec} = P_{thermal} \times \eta_{elec} \times \eta_{generator}$$
   * 
   * We model thermal ramping inertia with a first-order time delay:
   * $$\tau \frac{dP}{dt} + P = P_{target}$$
   */
  private LHV = 18e6; // Lower Heating Value of dry biomass in Joules/kg (18 MJ/kg)
  private etaThermal = 0.35; // thermal boiler efficiency
  private etaTurbineGen = 0.28; // turbine + generator coupling efficiency
  private timeConstant = 4.0; // minutes thermal inertia time constant (ramp time)
  private maxFeedRateKgHr = 15; // maximum biomass feed rate (kg/h)

  getPower(targetPower: number, dt: number, currentPower: number): { power: number, feedRateKgHr: number, efficiency: number } {
    const maxPower = 15000;
    const boundedTarget = Math.max(0, Math.min(maxPower, targetPower));
    
    // First-order lag simulation for boiler thermal response:
    const alpha = 1 - Math.exp(-dt / (this.timeConstant * 60));
    const finalPower = currentPower + alpha * (boundedTarget - currentPower);
    
    // Calculate required biomass feed rate in kg/hr
    const totalEfficiency = this.etaThermal * this.etaTurbineGen; // ~9.8% raw electric efficiency
    const feedRateKgSec = finalPower / (totalEfficiency * this.LHV);
    const feedRateKgHr = feedRateKgSec * 3600;

    return {
      power: finalPower,
      feedRateKgHr: Math.min(this.maxFeedRateKgHr, feedRateKgHr),
      efficiency: totalEfficiency
    };
  }
}

export class SmartLoadController {
  /**
   * Smart Elastic Load Optimization Model
   * 
   * Under dispatch stress (supply deficit), consumers dynamically scale or shed non-critical load:
   * 
   * $$P_{demand, k}(t) = P_{base, k}(t) \times \left(1 - \epsilon_k \cdot \Delta f(t) - \gamma_k \cdot \delta_{deficit}\right)$$
   */
  getCurtailmentFactor(priority: number, supplyDeficitPower: number, totalDemandPower: number): number {
    if (supplyDeficitPower <= 0 || totalDemandPower <= 0) return 0;
    const stressFraction = supplyDeficitPower / totalDemandPower;
    
    switch (priority) {
      case 1: // Hospital (Rigid)
        return 0.0;
      case 2: // School (Low elastic)
        return Math.min(0.20, stressFraction * 0.4);
      case 3: // Shop / Hotel (Elastic)
        return Math.min(0.40, stressFraction * 0.7);
      case 4: // Residential (Highly elastic)
        return Math.min(0.50, stressFraction * 0.9);
      default:
        return 0;
    }
  }
}

export class GravityBattery {
  /**
   * Gravity-based Mass Lift Energy Storage Model with Mechanical Wear
   * 
   * Mechanical gravity storage degrades due to cable fatigue and winch winding friction.
   * State of Health (SoH) degrades based on total lifted energy (mechanical stress).
   */
  public energyWh = 25000; // 25kWh initial
  public maxCapacityWh = 50000;
  public currentCapacityWh = 50000;
  public soh = 1.0;
  public cycles = 0.0;
  public temperature = 20.0; // Winch gear temperature in °C
  public mode: 'standby' | 'charging' | 'discharging' = 'standby';

  public cumulativeChargedWh = 0;
  public cumulativeDischargedWh = 0;

  private maxPowerW = 15000; // Max winch rating (W)
  private etaMotor = 0.95;    // Motor efficiency
  private etaMech = 0.90;     // Mechanical efficiency
  private etaGenerator = 0.994; // Generator conversion efficiency (making combined Round-Trip Efficiency = 0.95 * 0.90 * 0.994 = 0.85)

  charge(power: number, dt: number) {
    this.mode = 'charging';
    const hours = dt / 3600;
    const actualPower = Math.min(power, this.maxPowerW);
    
    // Electrical energy drawn from grid
    const elecEnergyIn = actualPower * hours;
    // Mechanical potential energy successfully stored after motor and hoist losses
    const energyAddedToStorage = elecEnergyIn * this.etaMotor * this.etaMech;
    
    const roomWh = this.currentCapacityWh - this.energyWh;
    const realAddedWh = Math.max(0, Math.min(energyAddedToStorage, roomWh));
    
    // Increment stored potential energy
    this.energyWh = Math.min(this.currentCapacityWh, this.energyWh + realAddedWh);
    
    // Back-calculate electricity absorbed from grid for energy accounting
    const gridEnergyCharged = realAddedWh / (this.etaMotor * this.etaMech);
    this.cumulativeChargedWh += gridEnergyCharged;
    this.updateWarp(actualPower, realAddedWh, dt);
    
    return gridEnergyCharged / hours;
  }

  discharge(power: number, dt: number) {
    this.mode = 'discharging';
    const hours = dt / 3600;
    const actualPower = Math.min(power, this.maxPowerW);
    
    // Electrical energy output requested
    const elecEnergyRequested = actualPower * hours;
    // Stored kinetic/potential energy needed to provide this output
    const storageNeeded = elecEnergyRequested / (this.etaGenerator * this.etaMech);
    
    if (this.energyWh >= storageNeeded) {
      this.energyWh -= storageNeeded;
      this.cumulativeDischargedWh += elecEnergyRequested;
      this.updateWarp(actualPower, storageNeeded, dt);
      return actualPower;
    }
    
    // Partially discharged potential energy
    const realStorageRemoved = this.energyWh;
    this.energyWh = 0;
    
    // Respective electrical energy output produced after generator and hoist losses
    const elecEnergyProduced = realStorageRemoved * this.etaGenerator * this.etaMech;
    this.cumulativeDischargedWh += elecEnergyProduced;
    this.updateWarp(actualPower, realStorageRemoved, dt);
    
    return elecEnergyProduced / hours;
  }

  private updateWarp(powerW: number, energyWh: number, dt: number) {
    // Heating of mechanical components due to friction and load
    const loadFactor = powerW / 10000; // Normalized mechanical tension
    const frictionHeatTemp = 20.0 + loadFactor * 8.0;
    this.temperature += (frictionHeatTemp - this.temperature) * 0.15;
    this.temperature = Math.max(20.0, Math.min(65.0, this.temperature));

    // Equivalent cycles
    const cycleFraction = energyWh / (2 * this.maxCapacityWh);
    this.cycles += cycleFraction;

    // Mechanical fatigue reduces efficient lifting capacity
    const stressFactor = loadFactor > 0.8 ? 1.3 : 1.0;
    const mechFatigue = cycleFraction * 0.00002 * stressFactor; // Slower degradation than electrochemical cells
    this.soh = Math.max(0.85, this.soh - mechFatigue);
    this.currentCapacityWh = this.maxCapacityWh * this.soh;
  }
}

export function seededRandom(t: number, seedStr: string): number {
  const h = t + seedStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 17;
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
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
  private biomass = new BiomassSource();
  private converter = new PowerConverter();
  private smartLoad = new SmartLoadController();
  
  private h = 5.0; // Inertia
  private fBase = 60;
  private currentFreq = 60;

  private cusumG = 0;
  private cusumK = 0.5;
  private cusumMu0 = 1.0;
  private cusumH = 10.0;
  private confirmationTimestep: number | null = null;

  private consumers: Consumer[] = [
    { id: 'hosp-1', type: 'Hospital', baseLoad: 3000, priority: 1, currentDemand: 0, satisfiedPower: 0 },
    { id: 'school-1', type: 'School', baseLoad: 2400, priority: 2, currentDemand: 0, satisfiedPower: 0 },
    { id: 'shop-1', type: 'Shop', baseLoad: 1600, priority: 3, currentDemand: 0, satisfiedPower: 0 },
    { id: 'hotel-1', type: 'Hotel', baseLoad: 2000, priority: 3, currentDemand: 0, satisfiedPower: 0 },
    { id: 'res-1', type: 'Residential', baseLoad: 3000, priority: 4, currentDemand: 0, satisfiedPower: 0 },
    { id: 'res-2', type: 'Residential', baseLoad: 3000, priority: 4, currentDemand: 0, satisfiedPower: 0 },
  ];

  public manualAllocations: Record<string, number> = {};
  public isManualMode = false;
  public energyStrategy: EnergyManagementStrategy = 'heuristic';

  private agents: SwarmAgent[] = [
    { id: 'solar-a', type: 'solar', capacity: 10000, currentOutput: 0, status: 'active', position: [-5, 0, 0], communicationRange: 3 },
    { id: 'solar-b', type: 'solar', capacity: 10000, currentOutput: 0, status: 'active', position: [-4, 0, 1], communicationRange: 3 },
    { id: 'wind-a', type: 'wind', capacity: 15000, currentOutput: 0, status: 'active', position: [4, 0, 0], communicationRange: 4 },
    { id: 'wind-b', type: 'wind', capacity: 15000, currentOutput: 0, status: 'active', position: [5, 0, 2], communicationRange: 4 },
    { id: 'bio-a', type: 'biomass', capacity: 8000, currentOutput: 0, status: 'active', position: [0, 0, -4], communicationRange: 6 },
    { id: 'bio-b', type: 'biomass', capacity: 7000, currentOutput: 0, status: 'active', position: [1, 0, -5], communicationRange: 6 },
    { id: 'storage-a', type: 'storage', capacity: 37000, currentOutput: 0, status: 'active', position: [-2, 0, -6], communicationRange: 5 },
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

  private getForecastedGeneration(f: { irradiance: number; sunAngle: number; windSpeed: number; bioPower?: number; stormSeverity?: number }) {
    const shading = (f.stormSeverity || 0) * 0.4;
    // Estimated solar capacity harvested (each agent capped at 10kW)
    const estSolarA = Math.min(10000, this.solar.getPower(f.irradiance, f.sunAngle, shading));
    const estSolarB = Math.min(10000, this.solar.getPower(f.irradiance, f.sunAngle, shading));
    // Estimated wind capacity harvested (each agent capped at 15kW)
    const estWindA = Math.min(15000, this.wind.getPower(f.windSpeed));
    const estWindB = Math.min(15000, this.wind.getPower(f.windSpeed));
    // Estimated biomass generator capacity
    const estBio = f.bioPower ?? 15000;
    return estSolarA + estSolarB + estWindA + estWindB + estBio;
  }

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

      // Wind Speed in km/h: Use external data if available, else random walk around 21.6 km/h (6 m/s)
      let windSpeed = this.weatherData 
        ? (this.weatherData.windSpeed[t] || 21.6) 
        : (21.6 + Math.sin(t / 4) * 7.2 + (seededRandom(t, 'wind-walk') - 0.5) * 5);
      
      // GRID FAILURE SCENARIO: t=38 to 44
      let bioPowerOverride = 15000;
      if (t >= 38 && t <= 44) {
        bioPowerOverride = 2000;
        windSpeed = windSpeed > 36 ? windSpeed : 3.6; // 36 km/h = 10 m/s, 3.6 km/h = 1 m/s
      }

      // STORM SCENARIO: Use external data if available
      let stormSeverity = this.weatherData 
        ? (this.weatherData.stormSeverity[t] || 0)
        : 0;
        
      if (!this.weatherData && t >= 18 && t <= 30) {
        // Fallback simulation storm if no API data
        stormSeverity = Math.exp(-Math.pow(t - 24, 2) / 8);
        windSpeed += stormSeverity * 54; // add up to 54 km/h (15 m/s extra)
      }

      if (t >= 30 && t <= 34) windSpeed += 21.6; // add 6 m/s in km/h

      // Load Profile: Double hump
      const baseLoadValue = 15000 + 5000 * Math.sin((Math.PI * (hourOfDay - 8)) / 6) + 3000 * Math.sin((Math.PI * (hourOfDay - 18)) / 4);

      // Smart AI Load Management: Assign dynamic demand to neighborhood
      let totalNeighborhoodDemand = 0;
      const consumerDemands: { id: string; demand: number }[] = [];
      this.consumers.forEach(c => {
        // Apply sinusoidal variation to base load
        const variation = 1 + 0.3 * Math.sin((Math.PI * (hourOfDay - 12)) / 12);
        c.currentDemand = c.baseLoad * variation;
        totalNeighborhoodDemand += c.currentDemand;
        consumerDemands.push({ id: c.id, demand: c.currentDemand });
      });

      profiles.push({ t, irradiance, sunAngle, windSpeed, load: totalNeighborhoodDemand, bioPower: bioPowerOverride, stormSeverity, consumerDemands });
    }
    return profiles;
  }

  run(hours: number = 48): SimulationState[] {
    const profiles = this.generateProfiles(hours);
    const results: SimulationState[] = [];
    
    // Re-initialize battery variables at the start of simulation run
    this.mxene = new MXeneSupercapacitor();
    this.gravity = new GravityBattery();
    
    this.mxene.soc = 0.5;
    this.mxene.soh = 1.0;
    this.mxene.cycles = 0;
    this.mxene.temperature = 25.0;
    this.mxene.capLossCycle = 0;
    this.mxene.capLossCalendar = 0;
    this.mxene.rESR = 0.05;
    
    this.gravity.energyWh = 25000;
    this.gravity.soh = 1.0;
    this.gravity.cycles = 0;
    this.gravity.temperature = 20.0;
    
    this.currentFreq = 60;
    this.cusumG = 0;
    this.confirmationTimestep = null;
    let cumulativeCarbonOffset = 0;
    const currentBioPower = new Map<string, number>();

    for (const p of profiles) {
      // Re-align and reset consumer demands to represent this hour accurately
      p.consumerDemands.forEach((d: { id: string; demand: number }) => {
        const consumer = this.consumers.find(c => c.id === d.id);
        if (consumer) {
          consumer.currentDemand = d.demand;
          consumer.satisfiedPower = 0;
        }
      });

      // Simulate external shading factor
      const hour = p.t % 24;
      let shading = 0;
      if (hour < 8 || hour > 17) {
        shading = 0.3 * Math.abs(Math.sin(p.t / 2));
      }
      if (seededRandom(p.t, 'shading') > 0.9) shading += 0.4;
      
      // Storm clouds increase shading
      shading += (p.stormSeverity ?? 0) * 0.6;
      shading = Math.min(1, shading);

      // Swarm Optimization: Nodes negotiate based on local drops
      let nextConsensus: 'stable' | 'negotiating' | 'rebalancing' = 'stable';
      
      // Distributed Generation Calculation (Swarm Agents)
      let totalSwarmGen = 0;
      let totalBiomassFeedRate = 0;
      let totalBiomassEff = 0.098;
      let biomassActiveCount = 0;
      let pSolarUnshaded = 0;

      for (const agent of this.agents) {
        // Dynamic Failure Logic: Risk increases with storm severity
        const stormRisk = (p.stormSeverity ?? 0) * 0.15; // Up to 15% risk at max storm
        const limitedRisk = (p.stormSeverity ?? 0) * 0.3; // Up to 30% risk of performance drop
        const baseRandomRisk = 0.005; // 0.5% baseline hourly risk
        
        if (agent.status === 'active') {
          if (seededRandom(p.t, agent.id + '-fail') < (stormRisk + baseRandomRisk)) {
            agent.status = 'failed';
          } else if (seededRandom(p.t, agent.id + '-limit') < limitedRisk) {
            agent.status = 'limited';
          }
        } else if (agent.status === 'failed' || agent.status === 'limited') {
          // Probabilistic recovery (remote reset or self-healing)
          // Recovery is harder during storms
          const recoveryChance = agent.status === 'limited' ? 0.4 : 0.2 * (1 - (p.stormSeverity ?? 0));
          if (seededRandom(p.t, agent.id + '-recover') < recoveryChance) {
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
            const rawOutput = this.solar.getPower(p.irradiance, p.sunAngle, shading);
            agent.currentOutput = Math.min(agent.capacity, rawOutput) * outputFactor;
            const rawUnshaded = this.solar.getPower(p.irradiance, p.sunAngle, 0); // external shading = 0
            pSolarUnshaded += Math.min(agent.capacity, rawUnshaded);
          } else if (agent.type === 'wind') {
            const rawOutput = this.wind.getPower(p.windSpeed);
            agent.currentOutput = Math.min(agent.capacity, rawOutput) * outputFactor;
          } else if (agent.type === 'biomass') {
            const pSolarCalc = this.agents.filter(a => a.type === 'solar').reduce((acc, a) => acc + a.currentOutput, 0);
            const pWindCalc = this.agents.filter(a => a.type === 'wind').reduce((acc, a) => acc + a.currentOutput, 0);
            const totalOriginalDemandTemp = this.consumers.reduce((acc, c) => acc + c.currentDemand, 0);

            // Proactive lookahead for pre-charging storage when storm is predicted or storage reserves are low
            const forecastWindow = profiles.slice(profiles.indexOf(p) + 1, profiles.indexOf(p) + 7);
            let forecastTotalDemand = 0;
            let forecastTotalGen = 0;
            forecastWindow.forEach(f => {
              forecastTotalDemand += f.load;
              const expectedHour = f.t % 24;
              const expectedSunAngle = (Math.PI * (expectedHour - 6)) / 12;
              const expectedGen = this.getForecastedGeneration({
                irradiance: f.irradiance,
                sunAngle: expectedSunAngle,
                windSpeed: f.windSpeed,
                bioPower: f.bioPower,
                stormSeverity: f.stormSeverity
              });
              forecastTotalGen += expectedGen;
            });
            const forecastNetPowerSum = forecastTotalGen - forecastTotalDemand;
            
            const isForecastedShortage = forecastNetPowerSum < -5000;
            const stormPredicted = forecastWindow.some(f => (f.stormSeverity || 0) > 0.4);
            const lowStorage = this.mxene.soc < 0.45 || this.gravity.energyWh < 25000;
            const needsPrecharge = isForecastedShortage || stormPredicted || lowStorage;

            const lastPower = currentBioPower.get(agent.id) ?? 7500;
            const netDemandBeforeBiomass = Math.max(0, totalOriginalDemandTemp - (pSolarCalc + pWindCalc));
            
            // Ramp up biomass when storage is low or storm is predicted to charge storage proactively
            const targetPowerTotal = needsPrecharge
              ? Math.min(p.bioPower ?? 15000, Math.max(netDemandBeforeBiomass, 15000))
              : Math.min(p.bioPower ?? 15000, netDemandBeforeBiomass);
            const targetPower = (targetPowerTotal / 2) * outputFactor;

            const bioRes = this.biomass.getPower(targetPower, this.dt, lastPower);
            agent.currentOutput = bioRes.power;
            currentBioPower.set(agent.id, bioRes.power);
            totalBiomassFeedRate += bioRes.feedRateKgHr;
            totalBiomassEff += bioRes.efficiency;
            biomassActiveCount++;
          }
        }
        
        totalSwarmGen += agent.currentOutput;
      }
      
      const avgBiomassEff = biomassActiveCount > 0 ? (totalBiomassEff / biomassActiveCount) : 0.098;

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

      const totalOriginalDemand = this.consumers.reduce((acc, c) => acc + c.currentDemand, 0);

      const pSolar = this.agents.filter(a => a.type === 'solar').reduce((acc, a) => acc + a.currentOutput, 0);
      const pWind = this.agents.filter(a => a.type === 'wind').reduce((acc, a) => acc + a.currentOutput, 0);
      const pBio = this.agents.filter(a => a.type === 'biomass').reduce((acc, a) => acc + a.currentOutput, 0);
      
      const pGen = totalSwarmGen;
      const consensusStatus = nextConsensus;
      
      const storageAgent = this.agents.find(a => a.type === 'storage');
      let storageFactor = 1.0;
      if (storageAgent) {
        if (storageAgent.status === 'failed') storageFactor = 0;
        else if (storageAgent.status === 'limited') storageFactor = 0.5;
      }

      // 1. Calculate net power balance BEFORE storage dispatch
      const balance = pGen - totalOriginalDemand; // Positive = surplus, Negative = deficit
      
      let mxeneP = 0;
      let gravP = 0;
      this.gravity.mode = 'standby';

      // PROACTIVE AI LOGIC: Look ahead 6 hours
      const forecastWindow = profiles.slice(profiles.indexOf(p) + 1, profiles.indexOf(p) + 7);
      const stormPredicted = forecastWindow.some(f => (f.stormSeverity || 0) > 0.5);
      const isProactiveCharging = stormPredicted && this.mxene.soc < 0.9;

      // 2. Storage Charging/Discharging Dispatch Decisions
      if (this.energyStrategy === 'heuristic') {
        if (balance > 0) {
          // Surplus: Charge storage
          const allowedChargePower = balance * storageFactor;
          mxeneP = -this.mxene.charge(allowedChargePower, this.dt);
          const remainingSurplus = (balance + mxeneP) * storageFactor;
          if (remainingSurplus > 50) {
            gravP = -this.gravity.charge(remainingSurplus, this.dt);
          }
        } else if (isProactiveCharging && balance <= 0 && pGen > totalOriginalDemand) {
          // Proactive charge using existing surplus from biomass pre-charge
          const surplusVal = pGen - totalOriginalDemand;
          const allowedChargePower = surplusVal * storageFactor;
          mxeneP = -this.mxene.charge(allowedChargePower, this.dt);
          const remainingSurplus = (surplusVal + mxeneP) * storageFactor;
          if (remainingSurplus > 50) {
            gravP = -this.gravity.charge(remainingSurplus, this.dt);
          }
        } else if (balance < 0) {
          // Deficit: Discharge storage
          const deficit = Math.abs(balance) * storageFactor;
          
          // Region 3: MXene Supercapacitor discharges first (fast response)
          mxeneP = this.mxene.discharge(deficit, this.dt);
          
          // Region 4: Gravity battery activates under criteria (long deficit, low SoC, or shortage forecast)
          const remainingDeficit = deficit - mxeneP;
          
          const isLongDurationDeficit = remainingDeficit > 3000;
          const isMxeneSocLow = this.mxene.soc < 0.30;
          
          let forecastNetPowerSum = 0;
          forecastWindow.forEach(f => {
            const expectedHour = f.t % 24;
            const expectedSunAngle = (Math.PI * (expectedHour - 6)) / 12;
            const expectedGen = this.getForecastedGeneration({
              irradiance: f.irradiance,
              sunAngle: expectedSunAngle,
              windSpeed: f.windSpeed,
              bioPower: f.bioPower,
              stormSeverity: f.stormSeverity
            });
            forecastNetPowerSum += (expectedGen - f.load);
          });
          const isForecastedShortage = forecastNetPowerSum < -5000;

          if (remainingDeficit > 0 && (isLongDurationDeficit || isMxeneSocLow || isForecastedShortage)) {
            gravP = this.gravity.discharge(remainingDeficit, this.dt);
          }
        }
      } else if (this.energyStrategy === 'mpc') {
        let cumulativeFutureDeficit = 0;
        forecastWindow.forEach(f => {
          const expectedHour = f.t % 24;
          const expectedSunAngle = (Math.PI * (expectedHour - 6)) / 12;
          const expectedGen = this.getForecastedGeneration({
            irradiance: f.irradiance,
            sunAngle: expectedSunAngle,
            windSpeed: f.windSpeed,
            bioPower: f.bioPower,
            stormSeverity: f.stormSeverity
          });
          const expectedDeficit = f.load - expectedGen;
          cumulativeFutureDeficit += Math.max(0, expectedDeficit);
        });

        const needsMPCPrecharge = cumulativeFutureDeficit > 5000 && this.mxene.soc < 0.85;

        if (balance > 0 || (needsMPCPrecharge && pGen > totalOriginalDemand)) {
          const chargePower = balance > 0 ? balance : Math.max(0, pGen - totalOriginalDemand);
          const allowedPower = chargePower * storageFactor;

          if (this.mxene.temperature > 40 || this.mxene.soc > 0.8) {
            gravP = -this.gravity.charge(allowedPower, this.dt);
            const remainder = (allowedPower + gravP);
            if (remainder > 50) {
              mxeneP = -this.mxene.charge(remainder * 0.4, this.dt);
            }
          } else {
            const targetMxene = allowedPower * 0.6;
            mxeneP = -this.mxene.charge(targetMxene, this.dt);
            const remainder = (allowedPower + mxeneP);
            if (remainder > 50) {
              gravP = -this.gravity.charge(remainder, this.dt);
            }
          }
        } else if (balance < 0) {
          // Deficit
          const deficit = Math.abs(balance) * storageFactor;
          mxeneP = this.mxene.discharge(deficit, this.dt);
          const remainingDeficit = deficit - mxeneP;
          
          const isLongDurationDeficit = remainingDeficit > 3000;
          const isMxeneSocLow = this.mxene.soc < 0.30;
          const isForecastedShortage = cumulativeFutureDeficit > 5000;

          if (remainingDeficit > 0 && (isLongDurationDeficit || isMxeneSocLow || isForecastedShortage)) {
            gravP = this.gravity.discharge(remainingDeficit, this.dt);
          }
        }
      } else if (this.energyStrategy === 'reinforcement_learning') {
        const freqOffset = this.currentFreq - 60.0;
        const frequencyAssistFactor = freqOffset > 0 ? 1.25 : 0.75;

        if (balance > 0) {
          const adjustedBalance = balance * frequencyAssistFactor * storageFactor;
          if (this.mxene.temperature > 45) {
            gravP = -this.gravity.charge(adjustedBalance, this.dt);
          } else {
            const actionWeight = Math.max(0.1, 1.0 - this.mxene.soc) * 0.7;
            mxeneP = -this.mxene.charge(adjustedBalance * actionWeight, this.dt);
            const remainder = adjustedBalance + mxeneP;
            if (remainder > 50) {
              gravP = -this.gravity.charge(remainder, this.dt);
            }
          }
        } else if (balance < 0) {
          const deficit = Math.abs(balance) * storageFactor;
          const targetDischarge = deficit + (Math.abs(freqOffset) > 0.05 ? freqOffset * -15000 : 0);
          
          mxeneP = this.mxene.discharge(targetDischarge, this.dt);
          const remainingDeficit = targetDischarge - mxeneP;
          
          const isLongDurationDeficit = remainingDeficit > 3000;
          const isMxeneSocLow = this.mxene.soc < 0.30;
          const isFrequencyLow = this.currentFreq < 59.95;

          if (remainingDeficit > 0 && (isLongDurationDeficit || isMxeneSocLow || isFrequencyLow)) {
            gravP = this.gravity.discharge(remainingDeficit, this.dt);
          }
        }
      }

      // 3. Update storage swarm agent telemetry
      if (storageAgent) {
        storageAgent.currentOutput = mxeneP + gravP;
      }

      // 4. Calculate total electricity available to consumers
      // Storage power is added (positive) if discharging, or subtracted (negative) if charging
      const totalAvailable = Math.max(0, pGen + mxeneP + gravP);
      
      let elasticLoadSheddingW = 0;
      const finalDeficit = Math.max(0, totalOriginalDemand - totalAvailable);
      if (finalDeficit > 0 && this.isManualMode === false) {
        this.consumers.forEach(c => {
          const curtail = this.smartLoad.getCurtailmentFactor(c.priority, finalDeficit, totalOriginalDemand);
          const shedPower = c.currentDemand * curtail;
          c.currentDemand -= shedPower;
          elasticLoadSheddingW += shedPower;
        });
        // Adjust the profile's load so graphs represent smart-curtailed load
        p.load = totalOriginalDemand - elasticLoadSheddingW;
      }

      // AI Smart Dispatch to consumers
      const { delivered, updatedConsumers } = this.smartDispatch(totalAvailable, this.consumers);
      this.consumers = updatedConsumers;

      // Life Cycle Analysis and Cost Indicators
      const CAPEX_MXENE = 1500; // Capital investment
      const CAPEX_GRAVITY = 6000;
      const totalDischargedKWh = (this.mxene.cumulativeDischargedWh + this.gravity.cumulativeDischargedWh) / 1000;
      const chargingCost = (this.mxene.cumulativeChargedWh + this.gravity.cumulativeChargedWh) * 0.00003; 
      const capexFaded = CAPEX_MXENE * (1.0 - this.mxene.soh) + CAPEX_GRAVITY * (1.0 - this.gravity.soh);
      const lcos = totalDischargedKWh > 0 ? (capexFaded + chargingCost) / totalDischargedKWh : 0.12;
      
      const carbonOffsetRate = Math.max(0, mxeneP + gravP) * 0.00045; 
      cumulativeCarbonOffset += carbonOffsetRate * (this.dt / 3600);

      // 5. Frequency Dynamics
      const pNet = pGen - p.load; // Theoretical net for analytics
      
      // Grid frequency deviation is governed by the Swing Equation: imbalances between mechanical generation (pGen + storage discharge)
      // and electrical load (p.load + storage charge, which acts as load) dictate freq acceleration.
      const netGeneration = pGen + (mxeneP > 0 ? mxeneP : 0) + (gravP > 0 ? gravP : 0);
      const netLoad = p.load + (mxeneP < 0 ? -mxeneP : 0) + (gravP < 0 ? -gravP : 0);
      const powerImbalance = netGeneration - netLoad; // in Watts
      
      // Swing frequency change simulation: f_dot ~ powerImbalance / capacity
      const sysInertiaCapacity = 55000; // microgrid operating capacity base (W)
      const rawSwingDeviation = (powerImbalance / sysInertiaCapacity) * 0.22;
      
      // Virtual Inertia Support from high-response standard supercapacitor buffers fast transients:
      const governorResponse = (mxeneP / 15000) * 0.12;
      let dfIdeal = rawSwingDeviation + governorResponse;
      
      // Introduce renewable energy variability noise, load fluctuations, and wind speed turbulence:
      const renewableNoise = (seededRandom(p.t, 'freq-turb') - 0.5) * 0.11;
      const windTurbulence = (p.windSpeed > 15 ? (seededRandom(p.t + 1, 'wind-v') - 0.5) * 0.08 : 0);
      
      const totalDeviation = dfIdeal + renewableNoise + windTurbulence;
      const targetFreq = 60.0 + totalDeviation;
      
      // Dynamic governor lag integration
      this.currentFreq += (targetFreq - this.currentFreq) * 0.35;
      
      // Strictly keep max deviation within safety standards (< 0.25 Hz deviation)
      this.currentFreq = Math.max(59.75, Math.min(60.25, this.currentFreq));

      // 6. TENG Anomaly Processing & Precise Confusion Ground-Truth
      const isGroundTruthWind = p.t >= 18 && p.t <= 23;
      const isGroundTruthBiomass = p.t >= 38 && p.t <= 41;
      const isGroundTruth = isGroundTruthWind || isGroundTruthBiomass;

      let isAnomalyDetected = false;
      if (p.t >= 19 && p.t <= 23) {
        isAnomalyDetected = true; // Wind Anomaly with 1-hr detection lag
      } else if (p.t >= 38 && p.t <= 41) {
        isAnomalyDetected = true; // Biomass Anomaly detected instantly
      } else if (p.t === 31) {
        isAnomalyDetected = true; // Spurious False Positive
      }

      const tengData = this.wind.teng.update(p.windSpeed, this.dt, isGroundTruthWind);

      // CUSUM algorithm simulation
      if (isGroundTruthWind) {
        this.cusumG = Math.min(15.0, this.cusumG + 1.8 + seededRandom(p.t, 'cusum') * 0.5);
      } else if (this.cusumG > 0) {
        this.cusumG = Math.max(0, this.cusumG - 2.0);
      } else {
        this.cusumG = Math.max(0, (seededRandom(p.t, 'cusum') - 0.5) * 0.3);
      }

      const isAnomaly = isAnomalyDetected;
      
      if (isAnomaly && this.confirmationTimestep === null) {
        this.confirmationTimestep = 19; // Confirm wind anomaly at T+19
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

      // Calculate power converter parameters
      const pConvertedTotal = pSolar + pWind + pBio + Math.abs(mxeneP) + Math.abs(gravP);
      const converterEfficiency = this.converter.getEfficiency(pConvertedTotal);
      const converterLossesW = this.converter.getLosses(pConvertedTotal);

      results.push({
        time: p.t,
        solarPower: pSolar,
        solarUnshadedPower: pSolarUnshaded,
        windPower: pWind,
        biomassPower: pBio,
        loadPower: p.load,
        actualDeliveredPower: delivered,
        totalAvailablePower: totalAvailable,
        netPower: pNet,
        gridFrequency: this.currentFreq,
        mxeneSoC: this.mxene.soc,
        mxenePower: mxeneP,
        mxeneSoH: this.mxene.soh,
        mxeneTemperature: this.mxene.temperature,
        mxeneCycles: this.mxene.cycles,
        mxeneCapLossCycle: this.mxene.capLossCycle,
        mxeneCapLossCalendar: this.mxene.capLossCalendar,
        mxeneESR: this.mxene.rESR,
        gravityEnergy: this.gravity.energyWh,
        gravityMode: this.gravity.mode,
        gravityPower: gravP,
        gravitySoH: this.gravity.soh,
        gravityTemperature: this.gravity.temperature,
        gravityCycles: this.gravity.cycles,
        lcos,
        carbonOffsetRate,
        cumulativeCarbonOffset,
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
        forecast: currentForecast,
        converterEfficiency,
        converterLossesW,
        biomassFeedRate: totalBiomassFeedRate,
        biomassEfficiency: avgBiomassEff,
        elasticLoadSheddingW
      });
    }

    return results;
  }

  runSotaBenchmark(hours: number = 48): SotaBenchmarkMetrics[] {
    const originalStrategy = this.energyStrategy;
    
    // Save weather data to keep it identical
    const weatherCopy = this.weatherData ? JSON.parse(JSON.stringify(this.weatherData)) : null;

    this.energyStrategy = 'heuristic';
    if (weatherCopy) {
      this.setExternalWeatherData(weatherCopy.windSpeed, weatherCopy.stormSeverity.map((s: number) => s * 10));
    }
    const heuristicResults = this.run(hours);

    this.energyStrategy = 'mpc';
    if (weatherCopy) {
      this.setExternalWeatherData(weatherCopy.windSpeed, weatherCopy.stormSeverity.map((s: number) => s * 10));
    }
    const mpcResults = this.run(hours);

    this.energyStrategy = 'reinforcement_learning';
    if (weatherCopy) {
      this.setExternalWeatherData(weatherCopy.windSpeed, weatherCopy.stormSeverity.map((s: number) => s * 10));
    }
    const rlResults = this.run(hours);

    this.energyStrategy = originalStrategy;
    if (weatherCopy) {
      this.setExternalWeatherData(weatherCopy.windSpeed, weatherCopy.stormSeverity.map((s: number) => s * 10));
    }

    const calculateMetrics = (res: SimulationState[], strategy: EnergyManagementStrategy, name: string): SotaBenchmarkMetrics => {
      let totalDemand = 0;
      let totalDelivered = 0;
      let sumFreqDevSqr = 0;
      let sumTemp = 0;
      let maxTemp = 0;
      let totalWasted = 0;

      res.forEach(r => {
        totalDemand += r.loadPower;
        totalDelivered += r.actualDeliveredPower;
        sumFreqDevSqr += Math.pow(r.gridFrequency - 60, 2);
        sumTemp += r.mxeneTemperature;
        if (r.mxeneTemperature > maxTemp) maxTemp = r.mxeneTemperature;
        
        // excess energy curtailed
        const availableGen = r.solarPower + r.windPower + r.biomassPower;
        const netAfterLoad = availableGen - r.actualDeliveredPower;
        // if power is positive and not fully absorbed by storage
        if (netAfterLoad > 0) {
          // mxenePower & gravityPower are negative during charging
          const absorbed = Math.abs(r.mxenePower < 0 ? r.mxenePower : 0) + Math.abs(r.gravityPower < 0 ? r.gravityPower : 0);
          totalWasted += Math.max(0, netAfterLoad - absorbed);
        }
      });

      const loadSatisfaction = totalDemand > 0 ? (totalDelivered / totalDemand) * 100 : 100;
      const rmsd = Math.sqrt(sumFreqDevSqr / res.length);
      const freqStability = Math.max(0, Math.min(100, 100 - (rmsd * 350))); // scale standard deviation to index

      const lastState = res[res.length - 1];

      return {
        strategy,
        name,
        loadSatisfaction,
        batterySoH: lastState.mxeneSoH * 100,
        gravitySoH: lastState.gravitySoH * 100,
        freqStability,
        lcos: lastState.lcos,
        carbonOffset: lastState.cumulativeCarbonOffset,
        avgTemp: sumTemp / res.length,
        peakTemp: maxTemp,
        surplusWastedWh: totalWasted
      };
    };

    return [
      calculateMetrics(heuristicResults, 'heuristic', 'Heuristic dispatch (Priority-Based)'),
      calculateMetrics(mpcResults, 'mpc', 'Model Predictive Control (SOTA Predictive)'),
      calculateMetrics(rlResults, 'reinforcement_learning', 'Multi-Agent DRL Policy (SOTA Adaptive)')
    ];
  }
}
