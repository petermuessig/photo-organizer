#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const promisify = require("util").promisify;
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const crypto = require("crypto");

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

let dateFormat;
function generateFilenamePrefix(type, createdAt, counter, counterPadStart) {
  const formattedDate = dateFormat(createdAt, "yyyymmdd_HHmmss");
  return `${type}_${formattedDate}_${new String(counter).padStart(counterPadStart, "0")}_`;
}

function generateFilename(fileNamePrefix, ext) {
  const fileHash = crypto.createHash("shake256", { outputLength: 3 }).update(`${fileNamePrefix}${ext.toLowerCase()}`).digest("hex");
  return `${fileNamePrefix}${fileHash}${ext.toLowerCase()}`;
}

// On Mac a free options are:
//   => using Preview App and Export to JPG
//   => using >> iMazing HEIC Converter <<

(async () => {
  dateFormat = (await import("dateformat/lib/dateformat.js")).default;

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
  const imagesPadStart = Math.max(`${images.length}`.length, 5);
  let imagesCouter = 0;

  await Promise.all(
    images.map(async (input) => {
      console.log(`Processing ${input}...`);
      const counter = ++imagesCouter;
      const fileInfo = path.parse(input);
      if (fileInfo.ext.toLowerCase() === ".jpeg") {
        fileInfo.ext = ".jpg";
      }
      const fileExif = await exifr.parse(input);
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
      const fileNamePrefix = generateFilenamePrefix(byPhoto ? "I" : "W", createdAt, counter, imagesPadStart);
      let output = path.join(
        fileInfo.dir,
        generateFilename(fileNamePrefix, fileInfo.ext)
      );
      return Promise.resolve({
        input,
        output
      });
    })
  ).then((files) => {
    files.reverse().forEach(({input, output}) => {
      if (input !== output) {
        console.log(`Renaming ${input} to ${output}...`);
        if (!fs.existsSync(output)) {
          fs.renameSync(input, output);
        } else {
          console.error(`[ERROR] Can't rename file ${input}`);
        }
      }
    });
  });

  const movies = await glob(path.join(basePath, "*.{mov,MOV,mp4,MP4}"), {
    nocase: false,
  });
  const moviesPadStart = Math.max(`${movies.length}`.length, 5);
  let moviesCouter = 0;

  await Promise.all(
    movies.map(async (input) => {
      console.log(`Processing ${input}...`);
      const counter = ++moviesCouter;
      const fileInfo = path.parse(input);
      let createdAt = new Date(fs.statSync(input).birthtime);
      const fileNamePrefix = generateFilenamePrefix("M", createdAt, counter, moviesPadStart);
      let output = path.join(
        fileInfo.dir,
        generateFilename(fileNamePrefix, fileInfo.ext)
      );
      return Promise.resolve({
        input,
        output
      });
    })
  ).then((files) => {
    files.reverse().forEach(({input, output}) => {
      if (input !== output) {
        console.log(`Renaming ${input} to ${output}...`);
        if (!fs.existsSync(output)) {
          fs.renameSync(input, output);
        } else {
          console.error(`[ERROR] Can't rename file ${input}`);
        }
      }
    });
  });

})();
