#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const promisify = require("util").promisify;
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

const glob = require("glob-promise");
const exifr = require("exifr");
const piexif = require("piexifjs");

async function readEXIF(inputFile) {
  const { parse } = (await import("date-format-parse/lib/index.js")).default;
  try {
    const jpeg = await readFile(inputFile);
    const data = jpeg.toString("binary");
    const exifObj = piexif.load(data);
    const dateString = exifObj.Exif[piexif.ExifIFD.DateTimeOriginal];
    if (dateString) {
      return {
        Model: exifObj.Exif[piexif.ExifIFD.LensModel],
        DateTimeOriginal: parse(
          dateString,
          "YYYY:MM:DD HH:mm:ss"
        ).toISOString(),
      };
    }
  } catch (ex) {
    console.error(`Failed to read EXIF from ${inputFile}.${ex}`);
  }
}

// On Mac a free options are:
//   => using Preview App and Export to JPG
//   => using >> iMazing HEIC Converter <<

(async () => {
  const dateFormat = (await import("dateformat/lib/dateformat.js")).default;

  // node lib/index.js ~/Pictures/Peters\ iPhone
  const basePath = process.argv[2];
  if (!basePath) {
    console.error(`Please enter the base path as argument!`);
    return;
  }

  const images = await glob(
    path.join(basePath, "*.{png,PNG,jpg,JPG,jpeg,JPEG}"),
    {
      nocase: false,
    }
  );

  await Promise.all(
    images.map(async (input) => {
      const fileInfo = path.parse(input);
      if (fileInfo.ext.toLowerCase() === ".jpeg") {
        fileInfo.ext = ".jpg";
      }
      const fileExif = await exifr.parse(input);
      console.log(`Processing ${input}...`);
      let byPhoto = true;
      let createdAt;
      if (fileExif?.DateTimeOriginal) {
        createdAt = new Date(fileExif.DateTimeOriginal);
        // screenshots have no model!
        if (!fileExif.Model) {
          byPhoto = false;
        }
      } else {
        if (fileInfo.ext.toLowerCase() === ".jpg") {
          // only jpegs can be handled here!
          const piexiExif = await readEXIF(input);
          if (piexiExif) {
            createdAt = piexiExif.DateTimeOriginal;
            // screenshots have no model!
            if (!piexiExif.Model) {
              byPhoto = false;
            }
          }
        }
        if (!createdAt) {
          byPhoto = false;
          createdAt = new Date((await stat(input)).birthtime);
        }
      }
      const formattedDate = dateFormat(createdAt, "yyyymmdd-HHmmss");
      const fileNamePrefix = `${byPhoto ? "I" : "W"}_${formattedDate}_`;
      let counter = 1;
      let output = path.join(
        fileInfo.dir,
        `${fileNamePrefix}${counter}${fileInfo.ext.toLowerCase()}`
      );
      if (input !== output && !fileInfo.name.startsWith(fileNamePrefix)) {
        while (fs.existsSync(output)) {
          counter++;
          output = path.join(
            fileInfo.dir,
            `${fileNamePrefix}${counter}${fileInfo.ext.toLowerCase()}`
          );
        }
        console.log(`Renaming ${input} to ${output}...`);
        fs.renameSync(input, output);
      }
      return Promise.resolve();
    })
  );

  const movies = await glob(path.join(basePath, "*.{mov,MOV,mp4,MP4}"), {
    nocase: false,
  });

  await Promise.all(
    movies.map(async (input) => {
      const fileInfo = path.parse(input);
      console.log(`Processing ${input}...`);
      let createdAt = new Date(fs.statSync(input).birthtime);
      const formattedDate = dateFormat(createdAt, "yyyymmdd-HHmmss");
      const fileNamePrefix = `M_${formattedDate}_`;
      let counter = 1;
      let output = path.join(
        fileInfo.dir,
        `${fileNamePrefix}${counter}${fileInfo.ext.toLowerCase()}`
      );
      if (input !== output && !fileInfo.name.startsWith(fileNamePrefix)) {
        while (fs.existsSync(output)) {
          counter++;
          output = path.join(
            fileInfo.dir,
            `${fileNamePrefix}${counter}${fileInfo.ext.toLowerCase()}`
          );
        }
        console.log(`Renaming ${input} to ${output}...`);
        fs.renameSync(input, output);
      }
      return Promise.resolve();
    })
  );
})();
