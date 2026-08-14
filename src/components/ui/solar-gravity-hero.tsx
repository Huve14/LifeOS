import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getNextAbuDhabiLightChange, isNightInAbuDhabi } from '../../lifeos/daylight';

const ORBIT_PARTICLES = 4200;

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function useAbuDhabiNight() {
  const [night, setNight] = useState(() => isNightInAbuDhabi());

  useEffect(() => {
    let timer = 0;

    const refresh = () => {
      const now = new Date();
      setNight(isNightInAbuDhabi(now));
      const nextChange = getNextAbuDhabiLightChange(now);
      timer = window.setTimeout(refresh, Math.max(1_000, nextChange.getTime() - now.getTime() + 1_500));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('lifeos:resumed', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('lifeos:resumed', refresh);
    };
  }, []);

  return night;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function CelestialOrbit({ reducedMotion, night }: { reducedMotion: boolean; night: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => {
    const random = seededRandom(20260814);
    const nextPositions = new Float32Array(ORBIT_PARTICLES * 3);
    const nextColors = new Float32Array(ORBIT_PARTICLES * 3);
    const palette = night
      ? [new THREE.Color('#E6F2F4'), new THREE.Color('#81CEEB'), new THREE.Color('#FFF9C7')]
      : [new THREE.Color('#F6D110'), new THREE.Color('#FFF9C7'), new THREE.Color('#81CEEB')];

    for (let index = 0; index < ORBIT_PARTICLES; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = 2.15 + Math.pow(random(), 1.55) * 1.42;
      const verticalSpread = (random() + random() - 1) * 0.16;
      const particle = index * 3;
      nextPositions[particle] = Math.cos(angle) * distance;
      nextPositions[particle + 1] = verticalSpread;
      nextPositions[particle + 2] = Math.sin(angle) * distance;

      const source = palette[Math.floor(random() * palette.length)];
      const brightness = 0.64 + random() * 0.36;
      nextColors[particle] = source.r * brightness;
      nextColors[particle + 1] = source.g * brightness;
      nextColors[particle + 2] = source.b * brightness;
    }

    return { positions: nextPositions, colors: nextColors };
  }, [night]);

  useFrame((_, delta) => {
    if (!reducedMotion && pointsRef.current) {
      pointsRef.current.rotation.z += delta * 0.025;
    }
  });

  return (
    <points ref={pointsRef} rotation={[1.13, 0.14, -0.24]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.024}
        vertexColors
        transparent
        opacity={0.84}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function CelestialSparkles({ reducedMotion, night }: { reducedMotion: boolean; night: boolean }) {
  const sparklesRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const random = seededRandom(7319);
    const values = new Float32Array(54 * 3);
    for (let index = 0; index < 54; index += 1) {
      const particle = index * 3;
      values[particle] = (random() - 0.5) * 8;
      values[particle + 1] = (random() - 0.5) * 4.2;
      values[particle + 2] = (random() - 0.5) * 3;
    }
    return values;
  }, []);

  useFrame((_, delta) => {
    if (!reducedMotion && sparklesRef.current) {
      sparklesRef.current.rotation.y -= delta * 0.018;
    }
  });

  return (
    <points ref={sparklesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={night ? '#E6F2F4' : '#FFF9C7'}
        size={0.045}
        transparent
        opacity={0.58}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function Sun({ reducedMotion }: { reducedMotion: boolean }) {
  const sunRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!reducedMotion && sunRef.current) {
      sunRef.current.rotation.y += delta * 0.035;
      sunRef.current.rotation.z += delta * 0.008;
      sunRef.current.position.y = 0.32 + Math.sin(state.clock.elapsedTime * 0.72) * 0.055;
    }
  });

  return (
    <group ref={sunRef} position={[1.72, 0.32, 0]}>
      <group rotation={[0.06, -0.08, 0]}>
        <mesh>
          <sphereGeometry args={[1.34, 64, 64]} />
          <meshStandardMaterial
            color="#F6D110"
            emissive="#F6D110"
            emissiveIntensity={1.38}
            roughness={0.38}
            metalness={0.02}
          />
        </mesh>

        <mesh scale={1.16}>
          <sphereGeometry args={[1.34, 48, 48]} />
          <meshBasicMaterial
            color="#FFF9C7"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>

        <mesh scale={1.34}>
          <sphereGeometry args={[1.34, 40, 40]} />
          <meshBasicMaterial
            color="#F6D110"
            transparent
            opacity={0.065}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group rotation={[1.14, 0.08, -0.24]}>
        <mesh>
          <torusGeometry args={[2.18, 0.018, 10, 180]} />
          <meshBasicMaterial color="#FFF9C7" transparent opacity={0.48} />
        </mesh>
        <mesh rotation={[0, 0, 0.12]}>
          <torusGeometry args={[2.72, 0.009, 8, 180]} />
          <meshBasicMaterial color="#81CEEB" transparent opacity={0.34} />
        </mesh>
      </group>

      <CelestialOrbit reducedMotion={reducedMotion} night={false} />
      <pointLight color="#FFF1A0" intensity={18} distance={9} decay={2} />
    </group>
  );
}

const MOON_CRATERS = [
  { normal: [0.22, 0.28, 0.96], size: 0.22, opacity: 0.24 },
  { normal: [-0.38, 0.34, 0.88], size: 0.14, opacity: 0.2 },
  { normal: [0.48, -0.18, 0.86], size: 0.17, opacity: 0.19 },
  { normal: [-0.16, -0.42, 0.9], size: 0.27, opacity: 0.16 },
  { normal: [0.04, -0.02, 1], size: 0.1, opacity: 0.18 },
] as const;

function Moon({ reducedMotion }: { reducedMotion: boolean }) {
  const moonRef = useRef<THREE.Group>(null);
  const craters = useMemo(() => MOON_CRATERS.map(crater => {
    const normal = new THREE.Vector3(...crater.normal).normalize();
    return {
      ...crater,
      position: normal.clone().multiplyScalar(1.347),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    };
  }), []);

  useFrame((state, delta) => {
    if (!reducedMotion && moonRef.current) {
      moonRef.current.rotation.y += delta * 0.022;
      moonRef.current.rotation.z -= delta * 0.004;
      moonRef.current.position.y = 0.32 + Math.sin(state.clock.elapsedTime * 0.48) * 0.045;
    }
  });

  return (
    <group ref={moonRef} position={[1.72, 0.32, 0]}>
      <group rotation={[0.04, -0.16, -0.03]}>
        <mesh>
          <sphereGeometry args={[1.34, 64, 64]} />
          <meshStandardMaterial
            color="#D8E4E8"
            emissive="#6D8792"
            emissiveIntensity={0.14}
            roughness={0.94}
            metalness={0.01}
          />
        </mesh>

        {craters.map((crater, index) => (
          <mesh
            key={index}
            position={crater.position}
            quaternion={crater.quaternion}
            scale={crater.size}
          >
            <circleGeometry args={[1, 32]} />
            <meshStandardMaterial
              color="#71858E"
              transparent
              opacity={crater.opacity}
              roughness={1}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        ))}

        <mesh scale={1.18}>
          <sphereGeometry args={[1.34, 40, 40]} />
          <meshBasicMaterial
            color="#81CEEB"
            transparent
            opacity={0.075}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      <group rotation={[1.14, 0.08, -0.24]}>
        <mesh>
          <torusGeometry args={[2.18, 0.014, 10, 180]} />
          <meshBasicMaterial color="#E6F2F4" transparent opacity={0.4} />
        </mesh>
        <mesh rotation={[0, 0, 0.12]}>
          <torusGeometry args={[2.72, 0.008, 8, 180]} />
          <meshBasicMaterial color="#81CEEB" transparent opacity={0.28} />
        </mesh>
      </group>

      <CelestialOrbit reducedMotion={reducedMotion} night />
      <pointLight color="#B9E5F4" intensity={5} distance={8} decay={2} />
    </group>
  );
}

export type SolarGravityHeroProps = {
  className?: string;
};

export default function SolarGravityHero({ className = '' }: SolarGravityHeroProps) {
  const reducedMotion = useReducedMotionPreference();
  const night = useAbuDhabiNight();
  const [ready, setReady] = useState(false);

  return (
    <div
      className={`home-solar-scene${ready ? ' is-ready' : ''}${night ? ' is-night' : ''} ${className}`.trim()}
      data-celestial={night ? 'moon' : 'sun'}
      aria-hidden="true"
    >
      <div className="home-solar-fallback" />
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 7.2], fov: 44 }}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        performance={{ min: 0.62 }}
        onCreated={() => setReady(true)}
      >
        <ambientLight intensity={night ? 0.34 : 0.48} color="#E6F2F4" />
        <directionalLight
          position={[-5, 4, 5]}
          intensity={night ? 2.5 : 1.8}
          color={night ? '#B9E5F4' : '#FFF9C7'}
        />
        {night ? <Moon reducedMotion={reducedMotion} /> : <Sun reducedMotion={reducedMotion} />}
        <CelestialSparkles reducedMotion={reducedMotion} night={night} />
      </Canvas>
    </div>
  );
}
