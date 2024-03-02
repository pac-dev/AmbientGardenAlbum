// Post-processor in Faust with delay, reverb and compression

import("stdfaust.lib");
preamp = hslider("preamp", 1, 0, 1, 0.0001);
lpf = hslider("lpf", 500, 20, 10000, 0.001);

lp = fi.lowpass(2, lpf);
hp = fi.highpass(3, 200);

// mono -> stero ping pong delay
loopy_mst(dry) = dry*0.7 + l1*0.2 + l2*0.05, dry*0.7 + l1*0.1 + l2*0.2 with {
	l1 = dry : + ~ (de.fdelay2(9000, 0.001+0.0003*os.oscp(0.1, 2) : ba.sec2samp) * 0.6);
	l2 = dry : + ~ (de.fdelay2(9000, 0.001+0.0003*os.oscp(0.1, 0) : ba.sec2samp) * 0.6);
};
rev_st = re.zita_rev1_stereo(0, 200, 6000, 2.4, 2.7, 44100);
del_st = + ~ @(1.57 : ba.sec2samp) * 0.8, + ~ @(1.7 : ba.sec2samp) * 0.8;

process = _*preamp*0.3 : hp : lp : loopy_mst : del_st : rev_st : co.limiter_1176_R4_stereo;