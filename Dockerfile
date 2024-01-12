# Fetching the minified node image on apline linux
FROM node:slim

# Declaring env
ENV NODE_ENV production

# Setting up the work directory
WORKDIR /usr/src/app

# Copying all the files in our project
COPY . .

# Installing dependencies
RUN npm install

# Starting our application
CMD npm start

# Exposing server port
EXPOSE 3001