<div align="center">
</div>
Pulsar Grid: Digital Twin-Enabled Smart Grid for Hybrid Renewable Energy Integration

# Overview

Pulsar Grid is a simulation-driven smart grid framework that integrates renewable energy generation, self-powered sensing, advanced energy storage, and Digital Twin technology into a unified cyber-physical architecture.

The project explores how future energy infrastructures can evolve beyond conventional power delivery systems into intelligent, adaptive, and self-aware networks capable of monitoring, predicting, and responding to changing operating conditions in real time.

The proposed framework combines solar, wind, and biomass energy sources with self-powered sensor networks, Digital Twin-based monitoring, predictive maintenance strategies, and advanced storage concepts to improve grid resilience, sustainability, and operational efficiency.

---

## Project Objectives

* Integrate multiple renewable energy sources into a coordinated smart grid architecture.
* Develop a Digital Twin-based monitoring and analysis framework.
* Enable predictive maintenance through continuous system monitoring.
* Explore self-powered sensing using energy harvesting technologies.
* Investigate advanced storage solutions for energy balancing and backup support.
* Improve renewable energy utilization through intelligent system coordination.

---

## Key Features

### Hybrid Renewable Energy Integration

* Conventional Silicon Solar Photovoltaic Systems
* Tandem Solar Cells
* Golden Ratio-Based Solar Panel Layouts
* Conventional Wind Turbines
* Leaf-Inspired Low-Speed Wind Turbines
* Biomass Energy Generation

### Self-Powered Sensor Network

* Triboelectric Nanogenerator (TENG) Sensors
* Piezoelectric Energy Harvesting Sensors
* Structural Health Monitoring
* Vibration Monitoring
* Environmental Data Collection

### Digital Twin Framework

* Real-Time Virtual Grid Representation
* Continuous State Monitoring
* Anomaly Detection
* Predictive Maintenance
* Performance Evaluation

### Advanced Energy Storage

* MXene-Based Supercapacitor Storage
* State-of-Charge Monitoring
* Dynamic Charge and Discharge Control
* Gravity Battery Emergency Backup System

---

## System Workflow

1. Acquire real-time data from renewable energy sources and self-powered sensors.
2. Update the Digital Twin model using incoming operational data.
3. Calculate renewable energy generation from solar, wind, and biomass sectors.
4. Perform anomaly detection using CUSUM-based monitoring techniques.
5. Trigger predictive maintenance alerts when abnormal behavior is detected.
6. Compute net available power after generation and demand analysis.
7. Charge MXene-based storage systems during excess generation.
8. Discharge storage during generation deficits.
9. Activate Gravity Battery backup when storage falls below critical thresholds.
10. Update grid parameters including voltage, frequency, and storage state-of-charge.
11. Generate Digital Twin dashboards and system performance analytics.

---

## Simulation Highlights

The simulation framework evaluates:

* Renewable Generation vs Load Demand
* Solar-Wind-Biomass Energy Contribution Analysis
* Grid Voltage Stability
* Grid Frequency Stability
* State-of-Charge Monitoring
* MXene Storage Utilization
* Gravity Battery Activation Events
* TENG Sensor Analytics
* Predictive Maintenance Alerts
* Digital Twin Synchronization and Visualization

---

## Core Innovation

The proposed framework combines several emerging technologies into a unified renewable energy ecosystem:

* Renewable Energy Systems
* Smart Grid Technologies
* Digital Twins and Cyber-Physical Systems
* Self-Powered Sensor Networks
* Energy Harvesting Technologies
* Advanced Energy Storage Materials
* Predictive Maintenance Frameworks
* Intelligent Energy Management

Rather than treating generation, monitoring, storage, and maintenance as independent systems, Pulsar Grid integrates them into a coordinated architecture capable of adapting to changing grid conditions in real time.

---

## Research Contributions

* Development of a Digital Twin-enabled smart grid architecture for hybrid renewable energy integration.
* Exploration of Golden Ratio-inspired solar array layouts for improved spatial utilization.
* Integration of conventional and biomimetic renewable energy harvesting approaches.
* Implementation of self-powered sensing through TENG and piezoelectric technologies.
* Incorporation of MXene-based storage concepts for rapid energy balancing.
* Deployment of Gravity Battery systems as emergency backup infrastructure.
* Application of predictive maintenance techniques for fault detection and operational awareness.

---

## Technologies Used

* MATLAB / Simulink
* Renewable Energy Modeling
* Digital Twin Concepts
* Energy Storage Modeling
* Sensor Data Analytics
* Predictive Maintenance Techniques
* Smart Grid Control Systems

---

## Limitations

* The framework is currently simulation-based and has not been experimentally validated.
* MXene storage systems are represented conceptually and not physically implemented.
* Energy harvesting performance is modeled using theoretical assumptions.
* Large-scale deployment challenges and communication delays are not fully considered.
* Cybersecurity aspects of Digital Twin operation remain outside the scope of this work.
* Economic feasibility and lifecycle cost assessments are not included.

---

## Future Improvements

* Hardware implementation and experimental validation.
* Real-time IoT-enabled Digital Twin deployment.
* Integration of machine learning for advanced forecasting and control.
* Decentralized energy management using swarm-inspired coordination strategies.
* Cybersecurity-aware Digital Twin architectures.
* Smart city and microgrid-scale deployment studies.
* Integration with electric vehicle charging infrastructure.
* Autonomous self-healing grid control mechanisms.

---

## Contributors

* https://github.com/29EEE-PranavJ
* Chakhyusa Saisrita Mittra

---

## Vision

The long-term vision of Pulsar Grid is to contribute toward the development of intelligent renewable energy infrastructures capable of monitoring, understanding, and optimizing their own operation. By combining Digital Twins, renewable energy systems, self-powered sensing, and advanced storage technologies, the project explores a future where energy systems are not only sustainable, but also adaptive, resilient, and self-aware.

---

## License

This project is intended for academic, research, and educational purposes.


# Run and deploy your Simulation

This contains everything you need to run your simulation locally.

View your simulation in AI Studio: https://ai.studio/apps/d5fe6a99-7646-4bf5-a615-49d18c22bd63

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
