import type { Config } from "../types/config";

export function getFFmpegArgs(config: Config): string[] {
	  const ffmpegArgs = [
                '-y',
                '-f', 'image2pipe',
                '-r', `${config.fps}`,
                '-i', '-',
                '-c:v', 'libvpx-vp9',
                '-b:v', '4M',
                '-pix_fmt', 'yuva420p',
                '-auto-alt-ref', '0'
            ];
    
            // output decision
            if (config.save_as_file) {
                ffmpegArgs.push(config.filename);
            } else {
                ffmpegArgs.push(
                    '-f', 'webm',
                    'pipe:1'
                );
            }
    
	return ffmpegArgs;
}