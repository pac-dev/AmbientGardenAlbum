/**
 * Ambient rainstick.
 * 
 * A fairly obvious application of granular synthesis, with a mix of sine and
 * noise grains. This file contains control code and generates the dry sine
 * grains.
 * 
 * All other audio-rate code can be found in the faust directory.
 */

import { Graph, FaustNode, Sine } from '../../lib/tealib.js';
import { randomSeed, goldSeed } from '../../lib/math.js';

// set to false to manually control density:
const autoDensity = true;

export const sampleRate = 44100;
const graph = new Graph({ sampleRate });

// Create Faust node for noise grains, body and post-processing
const stick = new FaustNode('faust/stick.dsp', { preamp: 1, density: 0, noiseamp: 1 });
stick.connect(graph.out);

// Parameters to control the patch: amp, pitch, density
graph.addParam('preamp', { def: 1 }).connect(stick.preamp);
const pitchParam = graph.addParam('pitch', { def: .5 });
const density = (autoDensity) ?
	stick.density : 
	graph.addParam('density', { def: 10, min: 1, max: 80 });

// Create sine grains and connect them to the stick node
const rand = randomSeed(0);
const gold = goldSeed(0);
const nsines = 10;
const sines = [...new Array(nsines)].map(i => {
	const ret = new Sine();
	ret.f1 = 1000;
	ret.f2 = 1000;
	ret.amax = 0;
	ret.t = 1000;
	return ret;
});
sines.forEach(s => s.connect(stick));
let sinei = 0, lfo1 = 0;
const sig = x => Math.atan(x*2*4-4)/Math.PI+.5;
const isig = x => ((x-.5)*1.5874)**3+.5;
const trigger = () => {
	const sine = sines[sinei];
	sine.f1 = 3000 + 8000*pitchParam.value + 200*lfo1 - 1300*isig(gold());
	sine.f2 = sine.f1 - 2000 - 200*rand();
	sine.amax = (0.2 + (rand()**2)*0.8)*(sig(density.value/30));
	sine.t = 0;
	sinei = (sinei+1) % nsines;
};

// Control rate envelopes for the grains
const atk = 0.01, rel = 0.015, mid = 0.015;
const env = (x) => {
	if (x < atk) return .5-.5*Math.cos(Math.PI*x/atk);
	if (x < atk+rel*3) return Math.pow((.5+.5*Math.cos(Math.PI*(x-atk)/(rel*10))), 100);
	return 0;
};
const latk = 10, lrel = 20
const lenv = x => {
	const xr = x % (latk+lrel);
	return Math.min(xr/latk, (1-(xr-latk)/lrel)**2);
};

// At control rate, trigger sine grains and control noise rate in the stick
let countdown = 0;
graph.ctrl((t, delta) => {
	if (autoDensity) density.value = lenv(t)*20+1;
	stick.noiseamp.value = 0.05 + 0.12*sig(density.value / 15);
	lfo1 = Math.sin(t*0.2);
	countdown -= delta;
	if (countdown < 0) {
		countdown = (0.3+0.5*rand()) / Math.max(5,density.value);
		trigger();
	}
	for (const sine of sines) {
		sine.amp.value = env(sine.t) * sine.amax;
		sine.freq.value = sine.t < mid ? sine.f1 : sine.f2;
		if (sine.f2 > 100) sine.f2 *= 0.97;
		sine.t += delta;
	}
});

export const process = graph.makeProcessor();
