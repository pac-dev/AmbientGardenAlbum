// Contrabass instrument in Faust

import("stdfaust.lib");

// Use "sliders" to add parameters to control the instrument
preamp = hslider("preamp", 1, 0, 1, 0.0001);
freq = hslider("freq", 80, 30, 200, 0.001);
lp1 = hslider("lp1", 3300, 100, 10000, 0.0001);
lp2 = hslider("lp2", 580, 100, 1000, 0.0001);
noise1amt = hslider("noise1", 0, 0, 1, 0.0001);

// Convert frequency to delay line length in samples
f2samp(f) = (f : ma.inv : ba.sec2samp) - 1;

// Exciter: filtered oscillator
noise1 = no.noise * noise1amt * 0.5 : fi.lowpass(1, lp1) : fi.lowpass(2, lp2);
exc = noise1 : fi.highpass(2, 80);

// Resonator with artifacts
reso = loop(vibrato-alias) : loop(vibrato+alias) with {
	vibrato = freq * (1 + os.osc(4) * 0.008);
	alias = (3 / ma.SR) * freq * freq;
	loop(f) = + ~ (de.fdelay2(9000, f2samp(f)) * 0.8);
};

// Post-processing: reverb and compression
rev_st = re.zita_rev1_stereo(0, 200, 6000, 10, 20, 44100);
strin = exc*preamp : reso <: rev_st;// : co.limiter_1176_R4_stereo;
process = hgroup("strin", strin);