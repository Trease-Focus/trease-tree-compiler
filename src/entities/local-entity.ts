import { spawn, type ChildProcessWithoutNullStreams, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Generate } from '../models/generate';
import type { Context } from 'baojs';
import type { Config } from '../types/config';
import type { GeneratorResult } from '../types/generator-result';

export interface LocalEntityParams {
    videoDirectory?: string; // Defaults to 'raw_tree_arts'
    videoFilename?: string; // Optional: specific video file, otherwise picks first video found
}

const DEFAULT_VIDEO_DIRECTORY = 'trease-artwork';

export class LocalEntity implements Generate {
    private params: LocalEntityParams;

    constructor(params: LocalEntityParams) {
        this.params = params;
    }

    async getInfo(config?: Config): Promise<GeneratorResult> {
        const videoPath = await this.getVideoPath(0);
        return {
            videoPath
        };
    }

    private async getVideoPath(variant: number): Promise<string> {
        const { videoFilename } = this.params;
        const videoDirectory = this.params.videoDirectory || DEFAULT_VIDEO_DIRECTORY;

        if (!videoFilename) {
            throw new Error('videoFilename is required');
        }

        return path.join(videoDirectory, videoFilename, variant + ".mp4");
    }

    private getVideoDuration(videoPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                videoPath
            ]);

            let output = '';
            let errorOutput = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            (ffprobe as any).on('close', (code: number | null) => {
                if (code !== 0) {
                    reject(new Error(`ffprobe failed: ${errorOutput}`));
                    return;
                }
                const duration = parseFloat(output.trim());
                if (isNaN(duration)) {
                    reject(new Error('Could not parse video duration'));
                    return;
                }
                resolve(duration);
            });
        });
    }

    private getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'csv=s=x:p=0',
                videoPath
            ]);

            let output = '';
            let errorOutput = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            (ffprobe as any).on('close', (code: number | null) => {
                if (code !== 0) {
                    reject(new Error(`ffprobe failed: ${errorOutput}`));
                    return;
                }
                const [width, height] = output.trim().split('x').map(Number);
                if (isNaN(width) || isNaN(height)) {
                    reject(new Error('Could not parse video dimensions'));
                    return;
                }
                resolve({ width, height });
            });
        });
    }

    private extractFinalFrame(videoPath: string, outputImagePath: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const duration = await this.getVideoDuration(videoPath);
                
                // Seek to slightly before the end to get the last frame
                const seekTime = Math.max(0, duration - 0.1);

                const ffmpeg = spawn('ffmpeg', [
                    '-y', // Overwrite output file
                    '-ss', seekTime.toString(),
                    '-i', videoPath,
                    '-vframes', '1',
                    '-vf', [
                        // Remove black background with wider tolerance
                        'colorkey=black:0.15:0.15',
                        // Also catch near-black colors
                        'colorkey=0x101010:0.1:0.1',
                        // Erode/dilate to clean up edges (morphological operations)
                        'erosion=threshold0=0:threshold1=0:threshold2=0:threshold3=255',
                        'dilation=threshold0=0:threshold1=0:threshold2=0:threshold3=255',
                        // Slight blur on alpha channel for feathering
                        'split[rgb][alpha]',
                        '[alpha]alphaextract,boxblur=1:1[alphablur]',
                        '[rgb][alphablur]alphamerge',
                        // Ensure RGBA output
                        'format=rgba'
                    ].join(','),
                    outputImagePath
                ]);

                let errorOutput = '';

                ffmpeg.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                (ffmpeg as any).on('close', (code: number | null) => {
                    if (code !== 0) {
                        reject(new Error(`ffmpeg frame extraction failed: ${errorOutput}`));
                        return;
                    }
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async generate(
        ctx: Context,
        onStream?: (process: ChildProcessWithoutNullStreams, videoStream: ChildProcessWithoutNullStreams['stdout']) => void,
        config?: Config
    ): Promise<GeneratorResult> {
        console.log("Generating from local video");

        const videoPath = await this.getVideoPath(config?.seed ? parseInt(config.seed, 10) : 0);
        console.log(`   Video path: ${videoPath}`);

        // Determine output image path
        const videoDir = path.dirname(videoPath);
        const videoBasename = path.basename(videoPath, path.extname(videoPath));
        const imagePath = path.join(videoDir, `${videoBasename}_final_frame.png`);

        // Extract the final frame from the video
        console.log(`   Extracting final frame to: ${imagePath}`);
        if(config?.photoOnly){
            await this.extractFinalFrame(videoPath, imagePath);
            return {
                imagePath
            };
        }

        // Create processed webm with black background removed
        const processedVideoPath = path.join(videoDir, `${videoBasename}_processed.webm`);
        console.log(`   Processing video with colorkey to: ${processedVideoPath}`);
        
        // Get video dimensions
        const { width, height } = await this.getVideoDimensions(videoPath);
        console.log(`   Video dimensions: ${width}x${height}`);
        
        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-i', videoPath,
                '-vf', [
                    // Remove black background and create alpha channel
                    'colorkey=black:0.15:0.15',
                    'colorkey=0x101010:0.1:0.1',
                    'format=yuva420p' // Format for VP9 with alpha
                ].join(','),
                '-c:v', 'libvpx-vp9',
                '-auto-alt-ref', '0',
                '-b:v', '2M',
                processedVideoPath
            ]);

            let errorOutput = '';
            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            (ffmpeg as any).on('close', (code: number | null) => {
                if (code !== 0) {
                    reject(new Error(`ffmpeg video processing failed: ${errorOutput}`));
                    return;
                }
                resolve();
            });
        });

        if (onStream) {
            const ffmpegProcess = spawn('ffmpeg', [
                '-i', processedVideoPath,
                '-c:v', 'copy',
                '-f', 'webm',
                'pipe:1'
            ]);

            onStream(ffmpegProcess, ffmpegProcess.stdout);
        }


        return {
            videoPath: processedVideoPath,
        };
    }
}
