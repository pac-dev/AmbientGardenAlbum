// Reed-like waveguide instrument in Faust

import("stdfaust.lib");

// Use "sliders" to add parameters to control the instrument
freq = hslider("freq", 80, 30, 2000, 0.001);
lp1 = hslider("lp1", 2000, 100, 15000, 0.0001);
noise1amt = hslider("noise", 0, 0, 1, 0.0001);

// Exciter: filtered oscillator
noise1 = no.pink_noise*noise1amt : fi.lowpass(1, lp1);
exc = noise1 : fi.highpass(2, freq*1.2);

// Waveguide filters
wgbottom = 10 + freq * 0.1;
wgtop = 140 + freq*1.75;

// Convert frequency to delay line length in samples
wgf2samp(f) = 1 / (f + ((0.22*f*f)/(wgtop*2+wgbottom*2)) ) : ba.sec2samp - 1;

// Waveguide loop
reso = loop(vibrato-alias) : loop(vibrato+alias) : loop(vibrato) with {
	vibrato = freq * (1 + os.osc(5) * 0.006);
	alias = 0.013 * freq;
	wgf = fi.lowpass(1, wgtop) : fi.highpass(1, wgbottom);
	wg(f) = de.fdelay2(9000, wgf2samp(f)) : wgf;
	loop(f) = + ~ wg(f);
};

process = exc : reso : fi.notchw(freq*0.1, freq) : fi.notchw(freq*0.02, freq*2);
