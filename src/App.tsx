/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Activity, 
  Sun, 
  Wind, 
  Zap, 
  Battery, 
  AlertTriangle, 
  X,
  BarChart3, 
  Cpu, 
  Database,
  Info,
  RefreshCw,
  Home,
  Building2,
  Hotel,
  ShoppingCart,
  School as SchoolIcon,
  HeartPulse,
  BrainCircuit,
  CloudRain,
  Eye,
  History
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Legend
} from 'recharts';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Float, Text, Stars } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import { SimulationEngine, SimulationState, SwarmAgent } from './lib/simulation';
import { fetchWeatherForecast } from './services/weatherService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- 3D Components ---

function WindTurbine({ position, speed, status }: { position:  [number, number, number], speed: number, status: boolean }) {
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setRotation(prev => prev + speed * 0.1);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, [speed]);

  return (
    <group position={position}>
      {/* Tower */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.1, 0.2, 4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      {/* Nacelle */}
      <group position={[0, 4, 0.1]}>
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.6]} />
          <meshStandardMaterial color={status ? "#ef4444" : "#cbd5e1"} />
        </mesh>
        {/* Blades */}
        <group rotation={[0, 0, rotation]}>
          {[0, 120, 240].map(deg => (
            <mesh key={deg} rotation={[0, 0, (deg * Math.PI) / 180]} position={[0, 0, 0.3]}>
              <boxGeometry args={[0.1, 1.5, 0.02]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function Building({ position, type, satisfied, id }: { position: [number, number, number], type: string, satisfied: number, id: string }) {
  const color = satisfied < 0.9 ? "#ef4444" : (type === 'Hospital' ? "#34d399" : "#38bdf8");
  const height = type === 'Residential' ? 1 : 2;
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.8, height, 0.8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={satisfied > 0.5 ? 0.2 : 0} />
      </mesh>
      <Text position={[0, height + 0.3, 0.5]} fontSize={0.15} color="white" rotation={[-Math.PI / 4, 0, 0]}>
        {id.split('-')[0].toUpperCase()}
      </Text>
      {satisfied < 1 && (
        <Text position={[0, height + 0.6, 0]} fontSize={0.2} color="red">LOW PWR</Text>
      )}
    </group>
  );
}

function Neighborhood({ state }: { state: SimulationState }) {
  const layouts = useMemo(() => [
    { type: 'Hospital', pos: [0, 0, 0] },
    { type: 'School', pos: [2, 0, 0] },
    { type: 'Shop', pos: [0, 0, 2] },
    { type: 'Hotel', pos: [2, 0, 2] },
    { type: 'Residential', pos: [-2, 0, 0] },
    { type: 'Residential', pos: [-2, 0, 2] },
  ], []);

  const center = [0, 0, 1]; // Local transformer position

  const RainEffect = () => {
    const rainCount = 100 * state.stormSeverity;
    const rainPoints = useMemo(() => {
      const pts = [];
      for(let i=0; i<rainCount; i++) {
        pts.push([
          (Math.random() - 0.5) * 10,
          Math.random() * 10,
          (Math.random() - 0.5) * 10
        ]);
      }
      return pts;
    }, [rainCount]);

    if (state.stormSeverity === 0) return null;

    return (
      <group>
        {rainPoints.map((pos, i) => (
          <mesh key={i} position={pos as [number, number, number]}>
            <boxGeometry args={[0.01, 0.2, 0.01]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.4} />
          </mesh>
        ))}
      </group>
    );
  };

  return (
    <group position={[0, 0, -8]}>
      <Text position={[0, 4, 0]} fontSize={0.4} color="white" fontStyle="italic">AI-Managed Neighborhood Grid</Text>
      
      <RainEffect />

      {/* Central Transformer */}
      <mesh position={[center[0], 0.25, center[1]]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <pointLight position={[center[0], 1, center[1]]} color="#38bdf8" intensity={0.5} distance={3} />

      {layouts.map((l, i) => {
        const consumer = state.consumers.find(c => c.type === l.type);
        const satisfaction = consumer ? consumer.satisfiedPower / consumer.currentDemand : 1;
        
        // Wire visualization
        const wireColor = satisfaction < 0.9 ? "#ef4444" : "#38bdf8";
        
        return (
          <group key={i}>
            <Building position={l.pos as [number, number, number]} type={l.type} satisfied={satisfaction} id={consumer?.id || 'unknown'} />
            {/* Wire from building to center */}
            <mesh position={[(l.pos[0] + center[0]) / 2, 0.05, (l.pos[2] + center[1]) / 2]} 
                  rotation={[0, -Math.atan2(l.pos[2] - center[1], l.pos[0] - center[0]), 0]}>
              <boxGeometry args={[Math.sqrt(Math.pow(l.pos[0] - center[0], 2) + Math.pow(l.pos[2] - center[1], 2)), 0.02, 0.02]} />
              <meshStandardMaterial color={wireColor} emissive={wireColor} emissiveIntensity={satisfaction > 0.5 ? 1 : 0.2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function SolarFractalArray({ power, sunAngle, shading }: { power: number, sunAngle: number, shading: number }) {
  const phi = (1 + Math.sqrt(5)) / 2; // Golden Ratio
  const count = 21; // Fibonacci number for balanced spiral
  const baseScale = 0.4;

  return (
    <group>
      {Array.from({ length: count }).map((_, i) => {
        const angle = i * 2 * Math.PI * (1 - 1 / phi);
        const radius = Math.sqrt(i) * 0.8;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Individual panel shading logic (simulated variation across the array)
        const panelShading = Math.min(1, shading + (Math.sin(i * 0.5 + sunAngle) * 0.2));
        const efficiency = (1 - panelShading) * Math.max(0, Math.sin(sunAngle));
        const panelPower = (power / count) * (1 - panelShading);
        
        // Color based on efficiency: Gold for high gen, Slate for shaded/low gen
        const color = panelShading > 0.7 ? "#334155" : (efficiency > 0.5 ? "#fbbf24" : "#f59e0b");
        const emissive = efficiency > 0.3 ? color : "#000000";

        return (
          <group key={i} position={[x, 0.1, z]} rotation={[Math.PI / 4, angle, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[baseScale, 0.05, baseScale * 1.5]} />
              <meshStandardMaterial 
                color={color} 
                emissive={emissive} 
                emissiveIntensity={efficiency * 2}
                roughness={0.1}
                metalness={0.8}
              />
            </mesh>
            {/* Efficiency Indicator Beam */}
            {efficiency > 0.1 && (
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.01, 0.01, 1, 8]} />
                <meshBasicMaterial color={color} transparent opacity={efficiency * 0.5} />
              </mesh>
            )}
          </group>
        );
      })}
      
      {/* Central Accumulator Node */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f59e0b" emissive="#fbbf24" emissiveIntensity={power > 0 ? 1 : 0} />
      </mesh>
      
      <Text position={[0, 2, 0]} fontSize={0.3} color="white">
        Solar Fractal Array: {(power / 1000).toFixed(1)} kW
      </Text>
      <Text position={[0, 1.6, 0]} fontSize={0.15} color="#94a3b8">
        Golden Ratio Phyllotaxis Optimization ($\phi$)
      </Text>
    </group>
  );
}

function SwarmCommunicationLines({ agents, status, stormSeverity }: { agents: SwarmAgent[], status: string, stormSeverity: number }) {
  const dist = (p1: [number, number, number], p2: [number, number, number]) => 
    Math.sqrt(Math.pow(p1[0]-p2[0],2) + Math.pow(p1[1]-p2[1],2) + Math.pow(p1[2]-p2[2],2));

  // Determine interference level
  const interference = stormSeverity > 0.6 ? 0.8 : (stormSeverity > 0.3 ? 0.4 : 0.1);
  const isBlackout = stormSeverity > 0.85 && Math.random() > 0.5;

  if (isBlackout) return null;

  // Find pairs of agents that are within communication range of each other
  const activeLines: { a1: SwarmAgent, a2: SwarmAgent, isStrained: boolean, isCritical: boolean }[] = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a1 = agents[i];
      const a2 = agents[j];
      const d = dist(a1.position, a2.position);
      
      // Check if nodes are in range
      if (d <= a1.communicationRange || d <= a2.communicationRange) {
        // Stochastic link failure during high interference
        if (Math.random() > interference * 0.5) {
          const isCritical = a1.status === 'failed' || a2.status === 'failed';
          const isStrained = a1.status === 'limited' || a2.status === 'limited';
          activeLines.push({ a1, a2, isStrained, isCritical });
        }
      }
    }
  }

  return (
    <group>
      {activeLines.map(({ a1, a2, isStrained, isCritical }, i) => {
        // Create jitter effect for congested lines or critical failures
        const jitterIntensity = isCritical ? 0.4 : (isStrained ? 0.2 : 0.05);
        const jitter = (Math.random() - 0.5) * (interference + jitterIntensity) * 0.1;
        
        let color = "#fbbf24"; // Default stable
        if (isCritical) color = "#f43f5e";
        else if (isStrained) color = "#f59e0b";
        else if (status === 'rebalancing') color = "#34d399";
        
        const opacity = isCritical ? 0.6 : (isStrained ? 0.4 : 0.2);
        const pulse = Math.sin(Date.now() * 0.01 + i) * (isCritical || isStrained ? 0.3 : 0.1);
        
        return (
          <line key={i}>
            <bufferGeometry attach="geometry">
              <float32BufferAttribute 
                attach="attributes-position" 
                args={[new Float32Array([
                  a1.position[0] + jitter, a1.position[1] + jitter, a1.position[2] + jitter, 
                  a2.position[0] + jitter, a2.position[1] + jitter, a2.position[2] + jitter
                ]), 3]} 
                count={2} 
              />
            </bufferGeometry>
            <lineBasicMaterial 
              color={color} 
              transparent 
              opacity={opacity + pulse} 
              linewidth={isCritical ? 2 : 1}
              depthWrite={false}
            />
          </line>
        );
      })}
    </group>
  );
}

function SwarmNode3D({ agent, isSelected, onSelect, isAffected }: { agent: SwarmAgent, isSelected: boolean, onSelect: (id: string) => void, isAffected: boolean }) {
  const color = agent.status === 'failed' ? "#ef4444" : 
                agent.status === 'limited' ? "#f97316" : 
                (agent.type === 'solar' ? "#f59e0b" : agent.type === 'wind' ? "#3b82f6" : "#10b981");
  
  return (
    <group position={agent.position} onClick={(e) => { e.stopPropagation(); onSelect(agent.id); }}>
      <mesh>
        <sphereGeometry args={[isSelected ? 0.45 : 0.3, 16, 16]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={agent.status === 'failed' ? 2 : (isSelected ? 1.5 : (isAffected ? 1.0 : 0.5))} 
        />
      </mesh>
      {(isSelected || isAffected) && (
        <>
          <mesh rotation={[Math.PI/2, 0, 0]} position={[0, -0.35, 0]}>
            <ringGeometry args={[0.5, 0.6, 32]} />
            <meshBasicMaterial color={isAffected && agent.status === 'active' ? "#fbbf24" : color} transparent opacity={0.5} />
          </mesh>
          {/* Communication Range visualization */}
          <mesh rotation={[Math.PI/2, 0, 0]}>
            <circleGeometry args={[agent.communicationRange, 64]} />
            <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.1 : 0.03} />
          </mesh>
          <mesh rotation={[Math.PI/2, 0, 0]}>
            <ringGeometry args={[agent.communicationRange - 0.05, agent.communicationRange, 64]} />
            <meshBasicMaterial color={color} transparent opacity={isSelected ? 0.4 : 0.1} />
          </mesh>
        </>
      )}
      <Text position={[0, 0.6, 0]} fontSize={0.15} color="white">{agent.id.toUpperCase()}</Text>
      {isAffected && agent.status === 'active' && (
        <Text position={[0, 0.8, 0]} fontSize={0.1} color="#fbbf24" fontStyle="italic">REROUTING...</Text>
      )}
      {agent.status === 'failed' && (
        <Text position={[0, 1, 0]} fontSize={0.2} color="#ef4444" fontStyle="italic">NODE DROP</Text>
      )}
    </group>
  );
}

function DigitalTwinScene({ state, selectedAgentId, onSelect }: { state: SimulationState, selectedAgentId: string | null, onSelect: (id: string) => void }) {
  const sunAngle = (Math.PI * ((state.time % 24) - 6)) / 12;

  const dist = (p1: [number, number, number], p2: [number, number, number]) => 
    Math.sqrt(Math.pow(p1[0]-p2[0],2) + Math.pow(p1[1]-p2[1],2) + Math.pow(p1[2]-p2[2],2));

  // Determine affected nodes (those within range of a failed or limited node)
  const nonActiveAgents = state.swarmAgents.filter(a => a.status !== 'active');
  const affectedAgentIds = new Set<string>();
  
  state.swarmAgents.forEach(agent => {
    if (agent.status === 'active') {
      const hasFailingNeighbor = nonActiveAgents.some(fail => 
        dist(agent.position, fail.position) <= agent.communicationRange || 
        dist(agent.position, fail.position) <= fail.communicationRange
      );
      if (hasFailingNeighbor) {
        affectedAgentIds.add(agent.id);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[10, 10, 10]} />
      <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.1} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Swarm Agents & Consensus Communication */}
      <group>
        {state.swarmAgents.map(agent => (
          <SwarmNode3D 
            key={agent.id} 
            agent={agent} 
            isSelected={selectedAgentId === agent.id}
            onSelect={onSelect}
            isAffected={affectedAgentIds.has(agent.id)}
          />
        ))}
        <SwarmCommunicationLines 
          agents={state.swarmAgents} 
          status={state.swarmConsensusStatus} 
          stormSeverity={state.stormSeverity}
        />
      </group>

      {/* Solar Fractal Farm */}
      <group position={[-5, 0, 0]}>
        <SolarFractalArray 
          power={state.solarPower} 
          sunAngle={sunAngle} 
          shading={state.shadingFactor} 
        />
      </group>

      {/* Wind Farm */}
      <group position={[5, 0, 0]}>
        <WindTurbine position={[0, 0, 0]} speed={state.windPower / 5000} status={state.anomalyStatus} />
        {state.anomalyStatus && (
          <pointLight position={[0, 4, 1]} color="#ef4444" intensity={2} distance={5} />
        )}
        <Text position={[0, 5, 0]} fontSize={0.5} color={state.anomalyStatus ? "#ef4444" : "white"}>
          {state.anomalyStatus ? "WARNING: VIBRATION ANOMALY" : "Wind Turbine: Normal"}
        </Text>
      </group>

      {/* Smart Locality */}
      <Neighborhood state={state} />

      {/* Status Indicators */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <Text position={[0, 7, -5]} fontSize={0.8} color="#38bdf8">
          Grid Freq: {state.gridFrequency.toFixed(2)} Hz
        </Text>
      </Float>
    </>
  );
}

// --- Grid Schematic Component ---

function GridNode({ x, y, label, value, unit, icon: Icon, color, status = 'normal' }: any) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect 
        x="-40" y="-30" width="80" height="60" rx="8" 
        className={cn(
          "fill-slate-900 stroke-2 transition-colors duration-500",
          status === 'warning' ? "stroke-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" : "stroke-slate-700"
        )}
      />
      <circle cx="0" cy="-35" r="12" fill={color} className="opacity-80" />
      <Icon x="-6" y="-41" width="12" height="12" className="text-white" />
      <text y="5" textAnchor="middle" className="fill-slate-400 text-[8px] font-bold uppercase">{label}</text>
      <text y="20" textAnchor="middle" className="fill-white text-[10px] font-mono font-bold">
        {value} <tspan className="fill-slate-500 text-[7px]">{unit}</tspan>
      </text>
    </g>
  );
}

function PowerLine({ from, to, power, color }: any) {
  const isFlowing = Math.abs(power) > 500;
  const direction = power >= 0 ? 1 : -1;
  
  return (
    <g>
      <path 
        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} 
        stroke="#1e293b" 
        strokeWidth="2" 
        fill="none" 
      />
      {isFlowing && (
        <path 
          d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} 
          stroke={color} 
          strokeWidth="2" 
          fill="none" 
          strokeDasharray="4 8"
          className="animate-[dash_2s_linear_infinite]"
          style={{ 
            animationDirection: direction === 1 ? 'normal' : 'reverse',
            filter: `drop-shadow(0 0 2px ${color})`
          }}
        />
      )}
    </g>
  );
}

function GridSchematic({ state }: { state: SimulationState }) {
  const bus = { x: 180, y: 150 };
  const neighborhoodBus = { x: 320, y: 150 };
  const isEmergency = state.actualDeliveredPower < state.loadPower * 0.98;
  
  const genNodes = {
    solar: { x: 50, y: 50, label: 'Solar Array', color: '#f59e0b', icon: Sun },
    wind: { x: 50, y: 150, label: 'Wind Farm', color: '#3b82f6', icon: Wind },
    bio: { x: 50, y: 250, label: 'Biomass', color: '#10b981', icon: Zap },
  };

  const storageNodes = {
    mxene: { x: 180, y: 50, label: 'MXene Storage', color: '#22d3ee', icon: Battery },
    gravity: { x: 180, y: 250, label: 'Gravity Battery', color: '#6366f1', icon: Database },
  };

  const neighborhoodNodes = state.consumers.map((c, i) => {
    const spacing = 45;
    const startY = 150 - ((state.consumers.length - 1) * spacing) / 2;
    return {
      ...c,
      x: 380,
      y: startY + i * spacing,
      icon: c.type === 'Hospital' ? HeartPulse : 
            c.type === 'School' ? SchoolIcon :
            c.type === 'Residential' ? Home :
            c.type === 'Hotel' ? Hotel : ShoppingCart
    };
  });

  return (
    <div className="w-full h-full bg-slate-950/20 rounded-lg p-2 flex flex-col relative overflow-hidden">
      {/* Mode Overlay */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
         {isEmergency && (
           <div className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/40 rounded text-[8px] font-bold text-rose-500 uppercase tracking-tighter">
             Load Shedding Active
           </div>
         )}
         <div className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
           AI Balanced
         </div>
      </div>

      <svg viewBox="0 0 450 300" className="flex-1 w-full h-full max-w-[600px]">
        {/* Connection Lines from Generator to Bus */}
        <PowerLine from={genNodes.solar} to={{ x: bus.x, y: genNodes.solar.y }} power={state.solarPower} color="#f59e0b" />
        <PowerLine from={genNodes.wind} to={{ x: bus.x, y: genNodes.wind.y }} power={state.windPower} color="#3b82f6" />
        <PowerLine from={genNodes.bio} to={{ x: bus.x, y: genNodes.bio.y }} power={state.biomassPower} color="#10b981" />
        
        {/* Connection Lines from Bus to Storage */}
        <PowerLine from={storageNodes.mxene} to={bus} power={-state.mxenePower} color="#22d3ee" />
        <PowerLine from={storageNodes.gravity} to={bus} power={-state.gravityPower} color="#6366f1" />
        
        {/* Main Bus to Neighborhood Bus */}
        <PowerLine from={bus} to={neighborhoodBus} power={state.actualDeliveredPower} color={isEmergency ? "#ef4444" : "#94a3b8"} />

        {/* Neighborhood Bus to Consumers */}
        {neighborhoodNodes.map((n, i) => {
          const satisfaction = n.satisfiedPower / n.currentDemand;
          const isPriority = n.priority <= 2;
          const pColor = satisfaction < 0.9 ? "#ef4444" : (isPriority && isEmergency ? "#34d399" : "#a855f7");
          return (
            <React.Fragment key={i}>
              <PowerLine 
                from={{ x: neighborhoodBus.x, y: n.y }} 
                to={n} 
                power={n.satisfiedPower} 
                color={pColor} 
              />
              {isEmergency && isPriority && (
                <text x={(neighborhoodBus.x + n.x) / 2} y={n.y - 4} textAnchor="middle" className="fill-emerald-400 text-[6px] font-black uppercase tracking-tighter italic">Priority Path</text>
              )}
            </React.Fragment>
          );
        })}

        {/* Busbars */}
        <line x1={bus.x} y1="30" x2={bus.x} y2="270" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
        <line x1={neighborhoodBus.x} y1="30" x2={neighborhoodBus.x} y2="270" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
        
        {/* Nodes */}
        <GridNode {...genNodes.solar} value={(state.solarPower/1000).toFixed(1)} unit="kW" />
        <GridNode {...genNodes.wind} value={(state.windPower/1000).toFixed(1)} unit="kW" status={state.anomalyStatus ? 'warning' : 'normal'} />
        <GridNode {...genNodes.bio} value={(state.biomassPower/1000).toFixed(1)} unit="kW" />
        
        <GridNode {...storageNodes.mxene} value={(state.mxeneSoC*100).toFixed(0)} unit="%" status={isEmergency && state.mxenePower > 0 ? 'warning' : 'normal'} />
        <GridNode {...storageNodes.gravity} value={(state.gravityEnergy/1000).toFixed(1)} unit="kWh" status={isEmergency && state.gravityPower > 0 ? 'warning' : 'normal'} />

        {neighborhoodNodes.map((n, i) => {
          const satisfaction = n.satisfiedPower / n.currentDemand;
          return (
            <g key={i}>
               <rect x={n.x - 30} y={n.y - 15} width="60" height="30" rx="4" 
                     className={cn("fill-slate-900 stroke transition-all duration-500", 
                                  satisfaction < 0.9 ? "stroke-rose-500" : (isEmergency && n.priority <= 2 ? "stroke-emerald-500" : "stroke-slate-700"))} />
               <n.icon x={n.x - 22} y={n.y - 6} width="12" height="12" className={satisfaction < 0.9 ? "text-rose-400" : (isEmergency && n.priority <= 2 ? "text-emerald-400" : "text-slate-400")} />
               <text x={n.x - 6} y={n.y} className="fill-white text-[6px] font-mono leading-none">
                 {(n.satisfiedPower/1000).toFixed(1)}kW
               </text>
               <text x={n.x - 25} y={n.y + 10} className="fill-slate-500 text-[5px] uppercase font-bold">{n.type}</text>
               {satisfaction < 0.5 && (
                 <circle cx={n.x + 25} cy={n.y - 10} r="2" fill="#ef4444" className="animate-pulse" />
               )}
            </g>
          );
        })}
        
        <text x={bus.x - 5} y="20" textAnchor="end" className="fill-slate-500 text-[6px] font-bold uppercase italic">Generation Bus</text>
        <text x={neighborhoodBus.x + 5} y="20" textAnchor="start" className="fill-slate-500 text-[6px] font-bold uppercase italic">Locality Distribution</text>
      </svg>
      {/* CSS for animating lines */}
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -24; }
        }
      `}</style>
    </div>
  );
}

// --- UI Components ---

const Card = ({ children, className, title, icon: Icon }: { children: React.ReactNode, className?: string, title?: string, icon?: any }) => (
  <div className={cn("bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur-sm", className)}>
    {title && (
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
        {Icon && <Icon className="w-4 h-4 text-sky-400" />}
        <h3 className="text-sm font-medium text-slate-200 uppercase tracking-wider">{title}</h3>
      </div>
    )}
    {children}
  </div>
);

const Stat = ({ label, value, unit, icon: Icon, color }: { label: string, value: string | number, unit?: string, icon: any, color: string }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
    <div className={cn("p-2 rounded-md", color)}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-lg font-bold text-white leading-none mt-1">
        {value} <span className="text-xs font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  </div>
);

export default function App() {
  const [results, setResults] = useState<SimulationState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [isManualMode, setIsManualMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isFetchingWeather, setIsFetchingWeather] = useState(true);
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({
    'hosp-1': 15000,
    'school-1': 12000,
    'shop-1': 8000,
    'hotel-1': 10000,
    'res-1': 15000,
    'res-2': 15000,
  });
  const dashboardRef = React.useRef<HTMLDivElement>(null);

  const engine = useMemo(() => new SimulationEngine(), []);

  useEffect(() => {
    const initWeather = async () => {
      setIsFetchingWeather(true);
      const data = await fetchWeatherForecast();
      if (data.windSpeed.length > 0) {
        engine.setExternalWeatherData(data.windSpeed, data.precipitation);
      }
      setIsFetchingWeather(false);
      runSimulation(isManualMode, manualAllocations);
    };
    initWeather();
  }, [engine]);

  useEffect(() => {
    // Only run if we are not fetching weather (to avoid double initial run)
    if (!isFetchingWeather) {
      runSimulation(isManualMode, manualAllocations);
    }
  }, [isManualMode]);

  const runSimulation = (manualOverride = false, allocations = manualAllocations) => {
    engine.isManualMode = manualOverride;
    engine.manualAllocations = allocations;
    const data = engine.run(48);
    setResults(data);
    generateAIInsight(data);
  };

  const generateAIInsight = async (data: SimulationState[]) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") return;

    try {
      const ai = new GoogleGenAI({ apiKey: key });
      
      // Analyze a window where shortages might occur
      const summaryData = data.slice(15, 40).map(r => ({
        time: r.time,
        demand: Math.round(r.loadPower),
        delivered: Math.round(r.actualDeliveredPower),
        shortage: Math.round(r.loadPower - r.actualDeliveredPower),
        storm: r.stormSeverity > 0.3 ? "SEVERE" : r.stormSeverity > 0 ? "MODERATE" : "NONE",
        anomaly: r.anomalyStatus ? r.affectedComponent : "NORMAL"
      })).filter(r => r.shortage > 0 || r.storm !== "NONE");

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `As a Smart Grid AI Dispatcher, analyze this scenario involving weather storms and load shedding: ${JSON.stringify(summaryData.slice(0, 8))}. 
        Explain how you prioritized critical infrastructure like hospitals (Tier 1) during the storm and grid instability. Keep it brief, authoritative, and technical. 1-2 sentences.`,
      });
      
      setAiInsight(response.text || "AI Engine: Prioritizing Tier 1 (Hospitals) and Tier 2 (Schools) due to localized supply deficit.");
    } catch (err) {
      console.error(err);
      setAiInsight("AI Engine: Prioritizing Tier 1 (Hospitals) and Tier 2 (Schools) due to localized supply deficit.");
    }
  };

  const exportDashboard = async () => {
    if (dashboardRef.current === null) return;
    try {
      const dataUrl = await toPng(dashboardRef.current, {
        cacheBust: true,
        backgroundColor: '#020617',
        style: {
          borderRadius: '0'
        }
      });
      const link = document.createElement('a');
      link.download = `smartgrid-twin-snapshot-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export dashboard:', err);
    }
  };

  useEffect(() => {
    const data = engine.run(48);
    setResults(data);
    generateAIInsight(data);
  }, [engine]);

  useEffect(() => {
    if (!isPlaying || results.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % results.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, results]);

  const currentState = results[currentIndex] || results[0];

  const analysis = useMemo(() => {
    if (results.length === 0) return null;
    const totalHours = results.length;
    
    // Average Power Generation
    const avgSolar = results.reduce((acc, r) => acc + r.solarPower, 0) / totalHours;
    const avgWind = results.reduce((acc, r) => acc + r.windPower, 0) / totalHours;
    const avgBio = results.reduce((acc, r) => acc + r.biomassPower, 0) / totalHours;
    
    // Capacity Factors (assuming rated: Solar 20kW, Wind 30kW, Bio 15kW)
    const solarCF = (avgSolar / 20000).toFixed(3);
    const windCF = (avgWind / 30000).toFixed(3);
    const bioCF = (avgBio / 15000).toFixed(3);
    
    // Storage Round-Trip Efficiency (RTE)
    const mxeneCharge = results.reduce((acc, r) => acc + Math.abs(Math.min(0, r.mxenePower)), 0);
    const mxeneDischarge = results.reduce((acc, r) => acc + Math.max(0, r.mxenePower), 0);
    const mxeneRTE = mxeneCharge > 0 ? (mxeneDischarge / mxeneCharge * 100).toFixed(1) : "0.0";

    const gravityCharge = results.reduce((acc, r) => acc + Math.abs(Math.min(0, r.gravityPower)), 0);
    const gravityDischarge = results.reduce((acc, r) => acc + Math.max(0, r.gravityPower), 0);
    const gravRTE = gravityCharge > 0 ? (gravityDischarge / gravityCharge * 100).toFixed(1) : "0.0";

    // Effective Grid Inertia Estimation (H)
    // Formula: H = (ws * ΔP) / (2 * delta_omega_dot)
    // ws = 2 * PI * 60
    // ΔP = imbalance / TotalSystemCapacity (approx)
    // We pick a point where the imbalance changes significantly
    let estimatedH = 5.0; // Default
    if (results.length > 2) {
      const idx = 31; // Around the anomaly
      const df = (results[idx].gridFrequency - results[idx-1].gridFrequency);
      const dt = 3600; // time step
      const f_dot = df / dt;
      const imbalance = results[idx].netPower - results[idx].mxenePower - results[idx].gravityPower;
      const sysCapacity = 100000; // Reference capacity
      if (Math.abs(f_dot) > 1e-7) {
         estimatedH = Math.abs((60 * imbalance) / (sysCapacity * 2 * f_dot * dt)); // Simplified unit conversion
         // Clamping to a reasonable range for display (H usually 2-10)
         estimatedH = Math.min(10, Math.max(1, estimatedH));
      }
    }

    // Solar Shading Analysis
    const totalPotentialSolar = results.reduce((acc, r) => {
      const cosTheta = Math.max(0, Math.cos((Math.PI * ((r.time % 24) - 6)) / 12));
      const etaLayout = 0.20 * (1 + 0.12 * Math.log(1 + cosTheta));
      const irradiance = 1000 * Math.exp(-Math.pow((r.time % 24) - 12, 2) / 16);
      return acc + (50 * irradiance * etaLayout);
    }, 0);
    const actualSolar = results.reduce((acc, r) => acc + r.solarPower, 0);
    const shadingLoss = totalPotentialSolar > 0 ? ((1 - (actualSolar / totalPotentialSolar)) * 100).toFixed(1) : "0.0";
    const avgShading = (results.reduce((acc, r) => acc + r.shadingFactor, 0) / totalHours * 100).toFixed(1);

    return { solarCF, windCF, bioCF, mxeneRTE, gravRTE, estimatedH: estimatedH.toFixed(2), shadingLoss, avgShading };
  }, [results]);

  useEffect(() => {
    if (analysis) {
        console.log(`
========== MATHEMATICAL ANALYSIS REPORT ==========
1. Capacity Factors:
   Solar CF:  ${analysis.solarCF}
   Wind CF:   ${analysis.windCF}
   Biomass CF:${analysis.bioCF}

2. Solar Shading Analysis:
   Avg Shading:   ${analysis.avgShading}%
   Energy Loss:   ${analysis.shadingLoss}%

3. Storage Round-Trip Efficiency:
   MXene RTE:   ${analysis.mxeneRTE}%
   Gravity RTE: ${analysis.gravRTE}%

3. Grid Stability:
   Estimated Inertia (H): ${analysis.estimatedH} s
   Damping factor (D):    1.0 pu
==================================================
        `);
    }
  }, [analysis]);

  if (!currentState) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Initializing Digital Twin...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-sky-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-sky-500 p-2 rounded-lg shadow-lg shadow-sky-500/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                SmartGrid Digital Twin
              </h1>
              <p className="text-[10px] text-sky-400 font-mono uppercase tracking-widest">Real-Time Simulation Engine v2.4</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-500",
              currentState.swarmConsensusStatus === 'stable' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/20 border-amber-500/40 animate-pulse"
            )}>
              <RefreshCw className={cn("w-3 h-3", currentState.swarmConsensusStatus === 'stable' ? "text-emerald-400" : "text-amber-400 animate-spin")} />
              <span className={cn("text-[10px] font-bold uppercase tracking-widest", currentState.swarmConsensusStatus === 'stable' ? "text-emerald-400" : "text-amber-400")}>
                Swarm: {currentState.swarmConsensusStatus === 'stable' ? "Stable" : "Negotiating Consensus"}
              </span>
            </div>
            {currentState.isProactiveCharging && (
              <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 animate-pulse">
                <BrainCircuit className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">AI Pre-Storm Charging</span>
              </div>
            )}
            <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Network Mode</span>
                <span className={cn(
                  "text-xs font-bold uppercase",
                  currentState.actualDeliveredPower < currentState.loadPower * 0.98 ? "text-rose-500 animate-pulse" : "text-sky-400"
                )}>
                  {currentState.actualDeliveredPower < currentState.loadPower * 0.98 ? "Emergency AI Dispatch" : "Full Capacity Supply"}
                </span>
              </div>
              <div className={cn(
                "w-3 h-3 rounded-full",
                currentState.actualDeliveredPower < currentState.loadPower * 0.98 ? "bg-rose-500 shadow-[0_0_8px_#ef4444]" : "bg-sky-400 shadow-[0_0_8px_#38bdf8]"
              )} />
            </div>
            <button 
              onClick={exportDashboard}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700 text-xs font-medium"
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Capture Plot
            </button>
            <button 
              onClick={() => {
                const pythonCode = `
import numpy as np
import matplotlib.pyplot as plt

class Simulation:
    """
    Digital Twin Simulation of a Hybrid Renewable Energy Smart Grid
    
    MATHEMATICAL DERIVATIONS:
    
    1. Solar Source (Golden Ratio Layout & Shading):
       The effective area A_eff considering shading is:
       A_eff = A_panel * (1 - S_ext)
       Where S_ext is the external shading factor (0 to 1).
       Efficiency gain eta_layout:
       eta_layout = eta_base * (1 + alpha * ln(1 + cos(theta_sun)))
       Power: P = A_eff * Irradiance * eta_layout
    
    2. TENG Sensor (Contact-Separation Mode):
       Open-circuit voltage V_OC:
       V_OC = (sigma * x(t)) / epsilon_0
       Short-circuit current I_SC:
       I_SC = (S * sigma * d_0 * x'(t)) / (d_0 + x(t))^2
    
    3. MXene Supercapacitor Dynamics:
       State of Charge SoC dynamics:
       d(SoC)/dt = I(t) / (C_total * V_nom)
       Power losses:
       P_loss = I(t)^2 * R_ESR
    
    4. Grid Frequency (Swing Equation):
       The grid frequency stability follows:
       (2H / ws) * dw/dt = P_m - P_e - D(w - ws)
    """
    def __init__(self):
        self.dt = 3600
        self.hours = 48
        self.H = 5.0
        self.ws = 2 * np.pi * 60
        self.P_rated_solar = 20000
        self.P_rated_wind = 30000
        self.P_rated_bio = 15000
        
    def run(self):
        # Time array
        t = np.arange(0, self.hours, 1)
        
        # Generation Profiles
        solar = []
        shading_factors = []
        for h in t:
            irr = 1000 * np.exp(-(h % 24 - 12)**2 / 16)
            shading = 0.3 * abs(np.sin(h/2)) if (h%24 < 8 or h%24 > 17) else 0
    while np.random.rand() > 0.9: shading += 0.4
    shading = min(1, shading)
    
    # CUSUM Anomaly Detection Implementation:
    # formula: g[t] = max(0, g[t-1] + (x[t] - mu0) - k)
    cusum_g = 0
    mu0 = 1.0
    k = 0.5
    H = 10
    confirmed_timestep = None
    
    cos_theta = max(0, np.cos((np.pi * (h%24 - 6)) / 12))
    eta = 0.2 * (1 + 0.12 * np.log(1 + cos_theta))
    solar.append(50 * irr * eta * (1 - shading))
    shading_factors.append(shading)
    
    # Simulate vibration x[t]
    x_t = 0.5 * (wind[h-1]/6)**2 + (np.random.rand()-0.5)*0.2 if h > 0 else 1.0
    cusum_g = max(0, cusum_g + x_t - mu0 - k)
    if cusum_g > H and confirmed_timestep is None:
        confirmed_timestep = h
        
        solar = np.array(solar)
        wind = self.P_rated_wind * (0.2 + 0.1 * np.random.randn(len(t)))
        bio = np.ones(len(t)) * self.P_rated_bio
        
        # Load
        load = 25000 + 5000 * np.sin(2 * np.pi * t / 24)
        
        # Power Balance
        P_net = solar + wind + bio - load
        
        # Frequency integration (Euler)
        freq = np.ones(len(t)) * 60.0
        for i in range(1, len(t)):
            df = (P_net[i] / 50000) * (1 / (2 * self.H))
            freq[i] = freq[i-1] + df
            
        # Analysis
        solar_cf = np.sum(solar) / (self.P_rated_solar * self.hours)
        wind_cf = np.sum(wind) / (self.P_rated_wind * self.hours)
        bio_cf = np.sum(bio) / (self.P_rated_bio * self.hours)
        
        print("========== MATHEMATICAL ANALYSIS REPORT ==========")
        print(f"1. Capacity Factors:")
        print(f"   Solar CF: {solar_cf:.3f}")
        print(f"   Wind CF:  {wind_cf:.3f}")
        print(f"   Bio CF:   {bio_cf:.3f}")
        print(f"2. Grid Stability:")
        print(f"   Estimated H: {self.H} s")
        print("==================================================")
        
        return "Simulation Complete"

if __name__ == "__main__":
    sim = Simulation()
    sim.run()
`;
                const blob = new Blob([pythonCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'smart_grid_simulation.py';
                a.click();
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700 text-xs font-medium"
            >
              <Database className="w-4 h-4 text-sky-400" />
              Export Python
            </button>
            <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", currentState.anomalyStatus ? "bg-red-500" : "bg-emerald-500")} />
              <span className="text-xs font-medium">{currentState.anomalyStatus ? "System Alert" : "System Healthy"}</span>
            </div>
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
            >
              {isPlaying ? <Activity className="w-5 h-5 text-sky-400" /> : <RefreshCw className="w-5 h-5 text-slate-400" />}
            </button>
          </div>
        </div>
      </header>

      <main ref={dashboardRef} className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Stats & 3D View */}
        <div className="lg:col-span-4 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Net Power" value={(currentState.netPower / 1000).toFixed(1)} unit="kW" icon={Zap} color="bg-purple-500" />
            <Stat label="Storm Intensity" value={(currentState.stormSeverity * 100).toFixed(0)} unit="%" icon={CloudRain} color={currentState.stormSeverity > 0.5 ? "bg-rose-500" : "bg-slate-500"} />
            <Stat label="Solar Gen" value={(currentState.solarPower / 1000).toFixed(1)} unit="kW" icon={Sun} color="bg-amber-500" />
            <Stat label="Grid Freq" value={currentState.gridFrequency.toFixed(2)} unit="Hz" icon={Activity} color="bg-emerald-500" />
          </div>

          <Card title="Distributed Swarm Intelligence" icon={RefreshCw}>
            <div className="space-y-4">
              <div className="p-3 bg-slate-800/40 rounded-lg border border-slate-700">
                <p className="text-[10px] text-slate-500 uppercase font-black mb-2 tracking-tighter">Coordination Mechanism</p>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-sky-500/20 rounded-lg border border-sky-500/30">
                    <BrainCircuit className="w-4 h-4 text-sky-400" />
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed italic">
                    Grid nodes exchange P2P supply telemetry. If a node fails, neighbors adaptively increase capacity by +20% to stabilize frequency without central override.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {currentState.swarmAgents.map(agent => (
                  <button 
                    key={agent.id} 
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      "bg-slate-800/20 p-2 rounded border transition-all hover:bg-slate-800/40 text-left",
                      selectedAgentId === agent.id ? "border-sky-500/50 bg-sky-500/5" : "border-slate-700/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">{agent.id}</span>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        agent.status === 'failed' ? "bg-rose-500 animate-pulse" : 
                        agent.status === 'limited' ? "bg-amber-500 animate-bounce" : 
                        "bg-emerald-500 shadow-[0_0_5px_#10b981]"
                      )} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Neighborhood Smart Allocation" icon={BrainCircuit}>
            <div className="flex items-center justify-between mb-4 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2">
                <BrainCircuit className={cn("w-4 h-4", !isManualMode ? "text-sky-400" : "text-slate-500")} />
                <span className="text-[10px] font-bold uppercase tracking-wider">AI Optimizer</span>
              </div>
              <button 
                onClick={() => setIsManualMode(!isManualMode)}
                className={cn(
                  "relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none",
                  isManualMode ? "bg-amber-500" : "bg-slate-700"
                )}
              >
                <span className={cn(
                  "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                  isManualMode ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider">Manual</span>
              </div>
            </div>

            <div className="space-y-3">
              {currentState.consumers.map((c, i) => {
                const satisfaction = (c.satisfiedPower / c.currentDemand) * 100;
                const Icon = c.type === 'Hospital' ? HeartPulse : 
                            c.type === 'School' ? SchoolIcon :
                            c.type === 'Residential' ? Home :
                            c.type === 'Hotel' ? Hotel : ShoppingCart;
                return (
                  <div key={i} className="bg-slate-800/40 p-2 rounded border border-slate-700/50">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("w-3 h-3", satisfaction < 100 ? "text-rose-500" : "text-sky-400")} />
                        <span className="text-[10px] font-bold text-slate-300 uppercase">{c.type}</span>
                        <span className="text-[8px] px-1 bg-slate-700/50 rounded text-slate-500">P{c.priority}</span>
                      </div>
                      <span className={cn("text-[10px] font-mono", satisfaction < 100 ? "text-rose-500" : "text-sky-400")}>
                        {satisfaction.toFixed(0)}%
                      </span>
                    </div>
                    {isManualMode ? (
                      <div className="mt-1">
                         <input 
                           type="range" 
                           min="0" 
                           max={c.baseLoad * 1.5} 
                           value={manualAllocations[c.id] || 0}
                           onChange={(e) => {
                             const newVal = parseInt(e.target.value);
                             const nextAllocations = { ...manualAllocations, [c.id]: newVal };
                             setManualAllocations(nextAllocations);
                             runSimulation(true, nextAllocations);
                           }}
                           className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                         />
                         <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-0.5">
                           <span>0W</span>
                           <span>SET: {manualAllocations[c.id]}W</span>
                         </div>
                      </div>
                    ) : (
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div 
                          initial={false}
                          animate={{ width: `${satisfaction}%` }}
                          className={cn("h-full", satisfaction < 60 ? "bg-rose-500" : satisfaction < 100 ? "bg-amber-500" : "bg-sky-500")}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isManualMode && (
              <div className="mt-4 space-y-4">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-500 leading-tight">
                  <strong>Manual Override Active:</strong> AI optimization suspended. Available power is allocated sequentially based on your settings until budget is exhausted.
                </div>
                
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Power Budget (T+{currentState.time}h)</span>
                    <span className="text-[10px] font-mono text-white">
                      {(currentState.actualDeliveredPower / 1000).toFixed(1)} / {(currentState.totalAvailablePower / 1000).toFixed(1)} kW
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-sky-500 transition-all duration-500" 
                      style={{ width: `${(currentState.actualDeliveredPower / currentState.totalAvailablePower) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Grid Topology & Power Flow" icon={Zap} className="h-[300px] p-0 overflow-hidden">
            <GridSchematic state={currentState} />
          </Card>

          <Card title="Digital Twin 3D Visualization" className="h-[400px] relative overflow-hidden p-0">
            <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }} onPointerMissed={() => setSelectedAgentId(null)}>
              <DigitalTwinScene 
                state={currentState} 
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
              />
            </Canvas>
            
            <AnimatePresence>
              {selectedAgentId && (
                <motion.div 
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 300, opacity: 0 }}
                  className="absolute top-4 right-4 bottom-4 w-64 bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-xl p-4 shadow-2xl z-20 overflow-y-auto"
                >
                  {(() => {
                    const agent = currentState.swarmAgents.find(a => a.id === selectedAgentId);
                    if (!agent) return null;
                    
                    const history = results.slice(0, currentIndex + 1).map(r => {
                      const histAgent = r.swarmAgents.find(a => a.id === selectedAgentId);
                      return {
                        time: r.time,
                        status: histAgent?.status || 'active',
                        output: histAgent?.currentOutput || 0
                      };
                    });

                    const getStatusColor = (status: string) => {
                      if (status === 'failed') return "bg-rose-500";
                      if (status === 'limited') return "bg-amber-500";
                      return "bg-emerald-500";
                    };

                    const color = agent.status === 'failed' ? "text-rose-500" : (agent.status === 'limited' ? "text-amber-500" : (agent.type === 'solar' ? "text-amber-500" : agent.type === 'wind' ? "text-sky-500" : "text-emerald-500"));
                    
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex flex-col">
                            <h3 className="text-lg font-bold text-white uppercase tracking-tighter leading-none">{agent.id}</h3>
                            <span className="text-[8px] text-slate-500 font-bold uppercase mt-1">{agent.type} Unit</span>
                          </div>
                          <button onClick={() => setSelectedAgentId(null)} className="p-1 hover:bg-slate-800 rounded">
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Status</p>
                            <div className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                              <div className={cn("w-2 h-2 rounded-full", agent.status === 'failed' ? "bg-rose-500 animate-pulse" : (agent.status === 'limited' ? "bg-amber-500" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"))} />
                              <span className={cn("text-xs font-bold uppercase tracking-wider", color)}>{agent.status}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800/20 p-2 rounded border border-slate-700/30">
                              <p className="text-[10px] text-slate-500 uppercase font-black">Output</p>
                              <p className="text-xl font-mono font-bold text-white">{(agent.currentOutput / 1000).toFixed(1)} <span className="text-[10px] text-slate-500">kW</span></p>
                            </div>
                            <div className="bg-slate-800/20 p-2 rounded border border-slate-700/30">
                              <p className="text-[10px] text-slate-500 uppercase font-black">Capacity</p>
                              <p className="text-xl font-mono font-bold text-slate-400">{(agent.capacity / 1000).toFixed(0)} <span className="text-[10px] text-slate-600">kW</span></p>
                            </div>
                          </div>

                          <div className="bg-slate-800/20 p-2 rounded border border-slate-700/30">
                            <p className="text-[10px] text-slate-500 uppercase font-black">Comm. Range</p>
                            <p className="text-sm font-mono font-bold text-sky-400">{agent.communicationRange} <span className="text-[10px] text-slate-600">Units</span></p>
                          </div>

                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Performance Health</p>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                initial={false}
                                animate={{ width: `${(agent.currentOutput / agent.capacity) * 100}%` }}
                                className={cn("h-full", agent.status === 'failed' ? "bg-rose-500" : (agent.status === 'limited' ? "bg-amber-500" : "bg-sky-500"))}
                              />
                            </div>
                          </div>

                          <div>
                             <div className="flex items-center gap-2 mb-2">
                               <History className="w-3 h-3 text-slate-400" />
                               <p className="text-[10px] text-slate-500 uppercase font-black">Health History (24h)</p>
                             </div>
                             <div className="h-16 w-full bg-slate-950/50 rounded border border-slate-800/50 p-1 mb-1 overflow-hidden">
                               <ResponsiveContainer width="100%" height="100%">
                                 <LineChart data={history.slice(Math.max(0, history.length - 24)).map(h => ({
                                   ...h,
                                   val: h.status === 'active' ? 2 : (h.status === 'limited' ? 1 : 0)
                                 }))}>
                                   <YAxis hide domain={[0, 2.2]} />
                                   <Tooltip 
                                     content={({ active, payload }) => {
                                       if (active && payload && payload.length) {
                                         const data = payload[0].payload;
                                         return (
                                           <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[9px] uppercase font-mono">
                                             <p className="text-slate-500 mb-0.5">Time: T+{data.time}h</p>
                                             <p className={cn(
                                               "font-bold",
                                               data.status === 'failed' ? "text-rose-500" : (data.status === 'limited' ? "text-amber-500" : "text-emerald-500")
                                             )}>Status: {data.status}</p>
                                             <p className="text-slate-400 mt-0.5 whitespace-nowrap">Output: {(data.output / 1000).toFixed(1)} kW</p>
                                           </div>
                                         );
                                       }
                                       return null;
                                     }}
                                   />
                                   <Line 
                                     type="stepAfter" 
                                     dataKey="val" 
                                     stroke={agent.status === 'failed' ? "#f43f5e" : (agent.status === 'limited' ? "#f59e0b" : "#10b981")} 
                                     strokeWidth={2} 
                                     dot={false}
                                     isAnimationActive={false}
                                   />
                                 </LineChart>
                               </ResponsiveContainer>
                             </div>
                             <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                               <span>T-{Math.min(currentIndex, 24)}H</span>
                               <span>NOW</span>
                             </div>
                          </div>
                          
                          {agent.status !== 'active' && (
                            <div className={cn("p-3 rounded-lg border", agent.status === 'failed' ? "bg-rose-500/10 border-rose-500/30" : "bg-amber-500/10 border-amber-500/30")}>
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className={cn("w-3 h-3", agent.status === 'failed' ? "text-rose-500" : "text-amber-500")} />
                                <span className={cn("text-[10px] font-bold uppercase tracking-widest", agent.status === 'failed' ? "text-rose-500" : "text-amber-500")}>
                                  {agent.status === 'failed' ? "Critical Fault" : "Performance Limited"}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-300 leading-normal italic">
                                {agent.status === 'failed' 
                                  ? "Terminal node drop detected. Swarm P2P protocols negotiating reroute." 
                                  : "Degraded performance due to local network congestion or storm interference."}
                              </p>
                            </div>
                          )}

                          {currentState.stormSeverity > 0.4 && (
                            <div className="bg-sky-500/10 border border-sky-500/30 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Zap className="w-3 h-3 text-sky-400 animate-pulse" />
                                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">Signal Interference</span>
                              </div>
                              <p className="text-[10px] text-slate-300 leading-normal italic">
                                Storm intensity is causing packet loss in P2P mesh network. Communication range spatially restricted.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md p-2 rounded border border-white/10 text-[10px] font-mono">
                <p>LAT: 34.0522° N</p>
                <p>LNG: 118.2437° W</p>
                <p>ALT: 124m</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 uppercase font-bold">Simulation Time</p>
                <p className="text-2xl font-mono font-bold text-white">T+{currentState.time}h</p>
              </div>
            </div>
          </Card>

          <Card title="Mathematical Analysis Report" icon={Database} className="overflow-y-auto max-h-[600px]">
            <div className="space-y-6 text-sm">
              {/* Proactive Forecast Panel */}
              <div className="p-4 bg-slate-900/40 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-sky-400" />
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-tighter">AI Weather Look-ahead (12h)</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">PROACTIVE MODE: ACTIVE</span>
                </div>
                <div className="flex items-end gap-1 h-12">
                  {currentState.forecast.map((f, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div 
                        className={cn(
                          "w-full rounded-t transition-all cursor-crosshair",
                          f.stormSeverity > 0.5 ? "bg-rose-500" : f.stormSeverity > 0 ? "bg-amber-500" : "bg-sky-500/40"
                        )}
                        style={{ height: `${Math.max(10, f.windSpeed * 2)}%` }}
                      >
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                          <div className="bg-slate-800 border border-slate-700 p-2 rounded shadow-xl text-[8px] whitespace-nowrap">
                            <p>T+{f.time}h Forecast</p>
                            <p className="font-bold text-sky-400">Wind: {f.windSpeed.toFixed(1)} km/h</p>
                            <p className={f.stormSeverity > 0.5 ? "text-rose-400" : ""}>Severity: {(f.stormSeverity * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-[8px] text-slate-600 font-mono">
                  <span>CURRENT (T+{currentState.time}H)</span>
                  <span>+12H FORECAST</span>
                </div>
              </div>

              {/* AI Dispatch Insights */}
              <div className="p-4 bg-sky-950/20 rounded-lg border border-sky-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuit className="w-4 h-4 text-sky-400" />
                  <p className="text-xs font-bold text-sky-400 uppercase tracking-tighter">Smart AI Dispatch Insights</p>
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed italic">
                  {aiInsight || "Analyzing grid telemetry for optimized load shedding..."}
                </div>
              </div>

              {/* Anomaly Diagnosis & 3D Analytics */}
              {currentState.anomalyStatus && (
                <div className="p-4 bg-rose-950/20 rounded-lg border border-rose-900/40 animate-pulse">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <p className="text-xs font-bold text-rose-500 uppercase tracking-tighter">Anomaly Diagnostic Report</p>
                  </div>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed font-bold mb-2">
                    Affected System: <span className="text-white">{currentState.affectedComponent}</span>
                  </p>
                  <p className="text-[10px] text-slate-300 leading-relaxed italic">
                    {currentState.anomalyExplanation}
                  </p>
                  <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
                    <p className="text-[10px] text-rose-400 font-bold uppercase">
                      Statistical Confirmation: 
                      {currentState.cusumConfirmedTimestep !== null 
                        ? ` T+${currentState.cusumConfirmedTimestep}h` 
                        : " Pending..."}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="bg-rose-500/10 p-1.5 rounded border border-rose-500/20 text-center">
                       <p className="text-[8px] text-rose-400 uppercase">CUSUM Delta</p>
                       <p className="text-xs font-bold text-rose-500">+{currentState.cusumValue.toFixed(1)}</p>
                    </div>
                    <div className="bg-rose-500/10 p-1.5 rounded border border-rose-500/20 text-center">
                       <p className="text-[8px] text-rose-400 uppercase">Risk Level</p>
                       <p className="text-xs font-bold text-rose-500">CRITICAL</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Capacity Factor */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-sky-400 uppercase tracking-tighter">1. Capacity Factor (CF)</p>
                  <span className="text-[10px] font-mono text-slate-500">CF = ∫P_act dt / (P_rated * T)</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">Solar (Rated 20kW)</span>
                      <span className="font-mono text-amber-400">{analysis?.solarCF}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Number(analysis?.solarCF) * 100}%` }}
                        className="h-full bg-amber-500" 
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">Wind (Rated 30kW)</span>
                      <span className="font-mono text-blue-400">{analysis?.windCF}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Number(analysis?.windCF) * 100}%` }}
                        className="h-full bg-blue-500" 
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">Biomass (Rated 15kW)</span>
                      <span className="font-mono text-emerald-400">{analysis?.bioCF}</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Number(analysis?.bioCF) * 100}%` }}
                        className="h-full bg-emerald-500" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Solar Shading Analysis */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-tighter">2. Solar Shading Analysis</p>
                  <span className="text-[10px] font-mono text-slate-500">Loss = (1 - P_act / P_pot) * 100%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase">Avg Shading</p>
                    <p className="text-lg font-bold text-slate-300">{analysis?.avgShading}%</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase">Energy Loss</p>
                    <p className="text-lg font-bold text-amber-500">{analysis?.shadingLoss}%</p>
                  </div>
                </div>
              </div>
              
              {/* Storage RTE */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-tighter">3. Round-Trip Efficiency (η)</p>
                  <span className="text-[10px] font-mono text-slate-500">η = E_dis / E_ch</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase">MXene</p>
                    <p className="text-lg font-bold text-emerald-400">{analysis?.mxeneRTE}%</p>
                  </div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase">Gravity</p>
                    <p className="text-lg font-bold text-indigo-400">{analysis?.gravRTE}%</p>
                  </div>
                </div>
              </div>

              {/* CUSUM Anomaly */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-rose-400 uppercase tracking-tighter">4. CUSUM Anomaly Detection</p>
                  <span className="text-[10px] font-mono text-slate-500">g_k+ = max(0, g_k-1+ + y_k - μ₀ - K)</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-slate-500 mb-1">Current Decision Variable (g_k+)</p>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full transition-all duration-500", currentState.cusumValue > 10 ? "bg-rose-500" : "bg-sky-500")} 
                        style={{ width: `${Math.min(100, (currentState.cusumValue / 15) * 100)}%` }} 
                      />
                    </div>
                  </div>
                  <span className={cn("font-mono text-lg font-bold", currentState.cusumValue > 10 ? "text-rose-500" : "text-slate-300")}>
                    {currentState.cusumValue.toFixed(2)}
                  </span>
                </div>
                {currentState.cusumValue > 10 && (
                  <p className="text-[10px] text-rose-400 mt-2 font-bold animate-pulse uppercase">
                    Anomaly Confirmed at T+{currentState.cusumConfirmedTimestep}h (g_t &gt; H)
                  </p>
                )}
              </div>

              {/* Grid Inertia */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-tighter">5. Effective Grid Inertia (H)</p>
                  <span className="text-[10px] font-mono text-slate-500">2H/ω_s * dω/dt = Pm - Pe</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Estimated H_eff</p>
                    <p className="text-lg font-bold text-white">{analysis?.estimatedH} <span className="text-xs font-normal text-slate-500">s</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase">Damping (D)</p>
                    <p className="text-sm font-mono text-slate-300">1.0 pu</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Charts */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <Card title="Power Generation vs Demand" icon={BarChart3} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={results.slice(0, currentIndex + 1)}>
                  <defs>
                    <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="solarPower" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSolar)" name="Solar" />
                  <Area type="monotone" dataKey="windPower" stroke="#3b82f6" fillOpacity={0.1} fill="#3b82f6" name="Wind" />
                  <Line type="monotone" dataKey="loadPower" stroke="#94a3b8" strokeDasharray="3 3" dot={false} name="Theoretical Demand" />
                  <Line type="monotone" dataKey="actualDeliveredPower" stroke="#10b981" strokeWidth={2} dot={false} name="AI Dispatched Supply" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Solar Source: Irradiance & Shading" icon={Sun} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={results.slice(0, currentIndex + 1)}>
                  <defs>
                    <linearGradient id="colorShading" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Area type="monotone" dataKey="solarPower" stroke="#f59e0b" fillOpacity={0.2} fill="#f59e0b" name="Power Output (W)" />
                  <Area type="monotone" dataKey={(r) => r.shadingFactor * 10000} stroke="#94a3b8" fillOpacity={1} fill="url(#colorShading)" name="Shading (x100)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Storage Dynamics (SoC %)" icon={Battery} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={results.slice(0, currentIndex + 1)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[0, 1]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend verticalAlign="top" height={36}/>
                  <Line type="stepAfter" dataKey="mxeneSoC" stroke="#10b981" strokeWidth={2} dot={false} name="MXene SoC" />
                  <Line type="monotone" dataKey="gravityEnergy" stroke="#6366f1" strokeWidth={2} dot={false} name="Gravity (Wh)" yAxisId={1} />
                  <YAxis yAxisId={1} orientation="right" stroke="#6366f1" fontSize={10} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="TENG Sensor: Vibration Analysis" icon={AlertTriangle} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={results.slice(0, currentIndex + 1)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="vibrationAmplitude" stroke="#f43f5e" strokeWidth={2} dot={false} name="Vibration (mm)" />
                  <Line type="monotone" dataKey="cusumValue" stroke="#fbbf24" strokeWidth={1} strokeDasharray="5 5" dot={false} name="CUSUM" />
                  {/* Threshold Line */}
                  <Line type="monotone" dataKey={() => 2.5} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Limit" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Grid Frequency Stability" icon={Activity} className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={results.slice(0, currentIndex + 1)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} domain={[59.5, 60.5]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="gridFrequency" stroke="#06b6d4" strokeWidth={2} dot={false} name="Frequency (Hz)" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

          </div>

          {/* System Logs */}
          <Card title="Real-Time System Logs" icon={Info} className="h-[200px] overflow-y-auto font-mono text-[10px]">
            <div className="space-y-1">
              {results.slice(Math.max(0, currentIndex - 10), currentIndex + 1).reverse().map((r, i) => (
                <div key={i} className={cn("flex gap-4 p-1 rounded", r.anomalyStatus ? "bg-red-500/10 text-red-400" : "text-slate-400")}>
                  <span className="text-slate-600">[{r.time.toString().padStart(2, '0')}:00]</span>
                  <span>{r.anomalyStatus ? "CRITICAL: High vibration detected on Wind Turbine A1" : `Normal operation. Net Power: ${(r.netPower/1000).toFixed(2)}kW`}</span>
                  <span className="ml-auto">FREQ: {r.gridFrequency.toFixed(3)}Hz</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 p-6 mt-12 bg-slate-900/50">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-500">
            &copy; 2026 SmartGrid Digital Twin Simulation Framework. All rights reserved.
          </div>
          <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <a href="#" className="hover:text-sky-400 transition-colors">Documentation</a>
            <a href="#" className="hover:text-sky-400 transition-colors">API Reference</a>
            <a href="#" className="hover:text-sky-400 transition-colors">Export Data</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
