export function createCombatSystem({ $, S, PAL, push, undo, draw, toast, touchState, syncPlayer, renderPlayers, attachTip, newInitiativeId }) {
/* Condition icons drawn in code for both the panel and canvas. */
const CONDITIONS = [
  {id:'concentration', name:'Concentration', vb:24, fill:false, d:"M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 100-5"},
  {id:'blinded', name:'Blinded', vb:512, fill:true, d:"M255.97 22.75c-44.405 0-85.1 25.434-115.25 68.125-30.152 42.69-49.157 102.41-49.157 168.563 0 66.152 19.005 125.87 49.156 168.562 30.15 42.69 70.845 68.125 115.25 68.125 44.402 0 85.067-25.434 115.218-68.125 30.15-42.69 49.187-102.41 49.187-168.563 0-66.152-19.037-125.87-49.188-168.562-30.15-42.69-70.815-68.125-115.218-68.125zm77.468 116.313c10.96 39.393 15.825 78.762 16.843 118.156 16.952-3.024 33.782-6.753 50.376-11.44-5.884 14.73-26.045 26.294-50.187 32.032-.282 44.07-4.86 88.15-10.595 132.22-7.335-42.81-13.62-85.628-16.094-128.438-22 1.092-44.25-2.78-60.31-13.313 19.79-1.902 39.66-3.972 59.467-6.75-1.156-40.83 1.515-81.637 10.5-122.467zm-176.22 95.5c1.883-.025 3.75-.008 5.626.062-6.855 5.274-11.28 13.558-11.28 22.875 0 15.93 12.91 28.844 28.842 28.844 15.932 0 28.844-12.913 28.844-28.844 0-4.615-1.073-8.976-3-12.844 13.33 5.66 26.475 13.614 39.438 23.625-37.067 62.158-128.797 25.067-137.188-22.5 16.552-7.404 32.767-11.01 48.72-11.218z"},
  {id:'charmed', name:'Charmed', vb:512, fill:true, d:"M256.563 20.53c-48.747 0-93.132 25.712-125.844 68.44-32.714 42.726-53.282 102.36-53.282 168.405s20.568 125.648 53.28 168.375c32.713 42.727 77.098 68.438 125.845 68.438 48.746 0 93.13-25.71 125.843-68.438 32.713-42.727 53.28-102.33 53.28-168.375.002-66.045-20.567-125.68-53.28-168.406-32.712-42.728-77.097-68.44-125.844-68.44zm-54.97 148.657c14.85-.292 29.283 8.698 33.845 28.188 9.805 41.902-43.157 82.06-43.157 107.656-11.71-20.28-81.58-31.536-91-71.686-9.28-39.562 34.006-62.027 62.907-33.125 5.326-19.873 21.6-30.72 37.407-31.032zm106.532 0c16.245-.337 33.326 10.558 38.813 31.032 28.9-28.903 72.218-6.438 62.937 33.124-9.42 40.15-79.288 51.405-91 71.687 0-25.595-52.993-65.753-43.188-107.655 4.415-18.862 18.104-27.89 32.438-28.188zM258.03 350.595c34.49 0 68.985 7.503 99.283 22.53l6.468 3.22-1.467 7.062s-3.773 17.89-18.813 35.094-41.975 34.063-85.47 34.063c-43.492 0-70.427-16.86-85.467-34.063-15.04-17.204-18.813-35.094-18.813-35.094l-1.47-7.062 6.47-3.22c2.803-1.39 5.66-2.675 8.53-3.937v-.375h.814c27.954-12.135 58.942-18.218 89.937-18.218zm-72.56 54.25c.38.46.75.912 1.155 1.375 11.94 13.657 32.584 27.655 71.406 27.655 38.823 0 59.466-13.998 71.408-27.656.404-.464.773-.917 1.156-1.376H185.47z"},
  {id:'deafened', name:'Deafened', vb:512, fill:true, d:"M397.063 35.625c-.457-.016-1.004.003-1.625.03-3.728.168-10.345 1.242-18.313 3.876-10.624 3.514-23.957 9.298-38.813 16.782-29.71 14.97-65.58 36.7-100 60.813-34.42 24.112-67.443 50.63-91.593 74.875-23.258 23.347-37.07 45.37-38.19 56.813 12.647 31.888 32.353 64.766 23.72 110.812l-.063.313-.062.28c-6.6 25.567-2.835 44.212 4.47 53.626 7.303 9.414 17.606 12.227 33.155 5.03 1.985-.917 4.3-2 6.75-3.155-2.486-10.81-7.07-21.55-12.375-30a9 9 0 0 1-.22-.376 9 9 0 0 1 1.22-11.188 9 9 0 0 1 4.125-2.344 9 9 0 0 1 1-.187c2.646-.604 5.262-.946 7.875-.97 8.826-.075 17.342 2.934 24.625 7.69 5.605 3.658 10.678 8.318 15.156 13.624 23.114-16.29 48.865-40.562 68.844-77.158 32.997-60.45 66.407-123.794 89-175.593 13.73-31.47 23.427-58.843 26.688-77.75 1.63-9.455 1.47-16.734.343-20.657-1.126-3.924-1.658-4.41-4.624-5.063-.27-.06-.637-.11-1.094-.125zm-59.094 53.47c5.087-.17 10.11 1.105 13.936 4.56 5.103 4.61 6.45 11.296 6.156 17.595-.294 6.3-2.115 13.014-5.125 20.406a9.012 9.012 0 0 1-16.687-6.812c2.493-6.125 3.694-11.232 3.844-14.438.102-2.183-.234-3.068-.344-3.344-.283-.06-1.086-.154-3.188.282-3.422.71-9.126 3.035-16.375 7.53-10.088 6.26-23.188 16.672-39.25 31.907 2.553.783 4.967 2.106 6.844 3.97 6.717 6.667 6.88 15.32 6.314 25.5-.565 10.18-2.784 22.688-6.156 37.75a9 9 0 1 1-17.563-3.938c3.27-14.602 5.288-26.493 5.75-34.812.41-7.41-.96-10.778-.938-11.188-.906.116-2.742.554-5.5 1.907-5.415 2.655-13.532 8.252-23.875 16.905-23.02 25.275-49.96 57.655-80.812 98.313 11.047 9.275 20.027 18.605 24.313 29.25 2.58 6.405 3.118 14.112-.25 20.75-3.37 6.637-9.644 11.313-17.844 14.78a9 9 0 1 1-7.032-16.562c5.844-2.472 8.12-4.95 8.843-6.375.725-1.424.874-2.696-.405-5.874-2.56-6.355-12.36-17.034-25.625-27.47a9 9 0 0 1-1.625-12.498c31.042-41.276 58.145-74.417 81.656-100.72a9 9 0 0 1 2.626-3.437c.716-.62 1.395-1.182 2.094-1.78 33.625-37.063 59.61-59.7 78.938-71.688 8.363-5.187 15.527-8.456 22.218-9.843 1.673-.348 3.367-.57 5.063-.626zM186.75 390.31c4.65 10.366 8.14 21.8 9.313 33.5 1.473 14.686-.817 30.045-9.47 42.438 8.513 8.398 14.487 9.757 18.626 8.938 4.937-.98 10.24-6.094 13.686-12.313 5.635-10.16 2.592-31.96-7.625-49.156-5.107-8.6-11.703-15.928-18.374-20.283-2.1-1.37-4.13-2.333-6.156-3.125z"},
  {id:'exhausted', name:'Exhausted', vb:512, fill:true, d:"M19.188 16.406V123.28l153.593 81.75-70.655-188.624H19.187zm109.812 0L248.125 161.22l5.25-144.814H129zm165.25 0l40.906 133.156 60.72-133.156H294.25zm140.188 0l-14.594 155.938 74.75-69.5V16.406h-60.156zM19.188 167.062v97.532l99.874 9.937L19.19 167.064zm409.406 40.313c-17.884-.094-38.853 9.07-55.938 26.156-5.305 5.307-9.826 10.998-13.562 16.845-93.737-56.476-329.936 76.333-179 189.78H60.78l-26.468 47.72H291.5L203 384.625c24.27-26.708 67.458-43.704 97-45.063 13.793 45.098 36.265 113.497 71.75 148.313h60.844c-43.07-46.547-76.538-109.09-81.938-179.844 1.616 3.237 3.72 6.19 6.313 8.783 18.662 18.663 55.944 11.648 83.28-15.688s34.35-64.618 15.688-83.28c-7-7-16.614-10.413-27.344-10.47zM19.188 323v59.563l77.687-23.938L19.187 323z"},
  {id:'frightened', name:'Frightened', vb:512, fill:true, d:"M458.656 19.72c-57.77 6.715-81.53 39.592-99.28 77.093 74.776 2.09 108.602-23.12 99.28-77.094zM54.937 21.374c-9.32 53.974 24.505 79.154 99.282 77.063-17.752-37.5-41.512-70.346-99.282-77.063zM467.844 175.03c-4.32.2-9.382 2.47-15.22 7.19-8.233 6.657-16.966 12.814-26.124 18.468 28.704 32.76 45.837 74.055 56.563 118.437 10.61-69.51 11.1-145.308-15.22-144.094zM60.47 180.688c-25.47-.264-30.547 76.598-21.157 146.657 14.426-42.205 34.88-83.047 62.218-119.656-9.302-5.88-18.05-12.415-26.093-19.625-5.608-5.03-10.59-7.33-14.968-7.375zm341.592 33.407c-15.548 7.583-31.938 13.896-48.875 18.906 27.92 71.072 40.385 145.85 48.188 220.28 20.714-79.27 18.07-159.615.688-239.186zm-274.625 7.625c-16.893 65.397-28.75 128.586-20.874 194.124 13.266-63.588 33.256-123.988 66.156-178.22-15.82-4.037-31.007-9.326-45.282-15.905zm296.5 6.093c14.383 75.347 15.57 152.055-3.812 227.937 16.663-10.085 29.597-22.548 37.156-37.563 5.687-11.294 11.303-28.935 16.25-49.625-8.04-52.642-22.32-102.276-49.592-140.75zm-319.093 7.656c-27.066 40.656-46.15 86.125-58.22 132.436 4.792 20.483 10.948 38.554 18.282 51.438 5.968 10.483 15.548 19.897 27.844 28.156-15.18-73.294-4.838-142.62 12.094-212.03zm223.5 3.874c-19.46 4.21-39.347 6.785-59.22 7.687 22.523 66.597 34.172 134.63 43.876 202.595 10.35-70.784 13.795-140.562 15.344-210.28zm-128.75 3.875c-10.376 73.08-12.596 154.426 6.5 221.75 6.98-71.93 20.608-149.46 40.78-217.626-15.99-.28-31.828-1.637-47.28-4.125zm-21.688 23.06c-31.53 58.626-49.375 124.554-60.78 194.595 21.327 9.65 46.993 16.945 74.624 21.688-21.974-66.086-22.11-144.102-13.844-216.282zm168.188 2.22c-2.162 71.314-6.807 143.27-19.813 216.78 20.76-2.794 40.505-7.197 58.25-13.28-6.67-69.114-16.73-137.997-38.436-203.5zm-87.625 6.72c-18.06 67.556-30.09 143.006-35.626 211.5 25.292 2.497 51.388 2.97 76.687 1.25-9.87-72.005-20.188-143.462-41.06-212.75z"},
  {id:'grappled', name:'Grappled', vb:512, fill:true, d:"M243.512 23.29c-27.105 18.337-53.533 32.92-82.274 45.337-2.843 17.364-3.948 34.497-4.05 51.584 28.913 15.41 56.096 32.85 83.33 49.634l7.045 4.344-3.432 7.482c-12.12 26.572-24.33 47.087-46.245 70.3l-5.184 5.512-6.46-3.904c-32.974-19.974-74.472-38.724-113.373-53.95l6.826-17.374c36.79 14.4 75.11 32.32 108.153 51.504 15.396-17.198 25.326-33.354 34.713-52.89-43.44-26.91-86.13-53.51-134.69-70.632-23.012 20.357-37.705 45.243-51.942 70.74 8.324 25.495 6.596 53.376-6.596 77.46 48.58-.593 97.994 2.23 150.666 10.26l5.658.837 1.787 5.44c8.85 26.46 11.79 54.41 8.325 83.588l-.987 8.432-8.466-.187c-40.508-.864-80.175-2.138-118.17.234 1.634 15.94-2.31 30.972-7.724 45.025 13.427 28.54 27.38 55.8 48.29 79.39 41.27-19.05 73.564-31.288 115.93-42.85-3.407-13.72-6.918-26.36-11.097-33.62-5.122-8.9-10.207-13.057-17.85-15.256-15.284-4.4-44.533 2.293-92.894 19.454l-6.243-17.594c48.907-17.354 79.702-26.894 104.283-19.82 9.133 2.628 16.884 8.004 23.066 15.46 14.487-7.627 28.415-16.79 42.053-26.996 12.34-45.92 37.29-81.42 66.626-112.107-7.226-13.52-13.208-27.204-20.563-40.613l-3.394-6.168 5-4.965c23.275-23.13 47.34-40.157 71.87-52.487l8.395 16.716c-20.952 10.53-41.503 25.913-61.795 45.152 12.41 23.91 22.263 45.5 39.457 64.826 37.488-27.124 74.943-51.39 116.84-74.938-13.96-30.473-31.345-58.357-56.286-79.462-32.2 13.38-62.527 17.39-92.61 12.29-14.223 13.25-30.094 22.23-48.756 23.337-29.017 1.722-60.74-15.74-99.174-57.672l6.858-6.295.017-.028.006.006 6.88-6.314c36.702 40.043 63.74 52.87 84.32 51.65 18.514-1.1 35.03-14.95 51.684-35.406-28.827-31.81-64.174-59.94-97.822-84.465zM39.324 277.884c-6.06.022-12.104.098-18.142.223 1.673 26.288 5.512 51.288 14.052 73.732 45.88-5.82 93.308-4.96 141.15-3.87 1.518-21.27-.253-41.69-6.058-61.212-45.528-6.565-88.59-9.03-131.002-8.873z"},
  {id:'incapacitated', name:'Incapacitated', vb:512, fill:true, d:"M263.47 19.03c-1.234.04-2.47.126-3.69.126-38.983 0-70.75 33.895-70.75 75.906 0 21.274 8.43 40.465 21.5 54.282-80.868 10.566-98.35 105.42-79.124 191.562h31.656l-1.03-105.344 18.687-.187 1.25 129.25 10.218 130.313h55.53V319.344h18.688v175.594h56.22l12.687-143.313 1.125-116.25 18.687.188-1.03 105.343h33.5c21.795-88.46-5.595-178.95-79.626-190.687 13.658-13.88 22.53-33.346 22.53-55.157 0-39.39-27.808-72.008-63.406-75.907-1.187-.15-2.393-.162-3.625-.125zM248.28 36.5l12.25 35.03 25.095-27-18.594 44.845 44.22-9.125-29.094 19.313 21.594 12.28-34.47 1.75 20.908 38.563-26.375-15.78-10.907 20.03 15.22 27.844 42.343-12.28-29.94 35.874 57-9.063-39.217 34.47 18.5 42.47-22.782-5.19 22.345 104.876-53.656-101.97-62.095 67.814 35.813-90.28-32.813 10 22.22-34.94-49.814-24 54.72.345-27.28-31.78 37.28 9.686.625-52.06-25.125 3.686L241.844 99 211 74.406l31.438 3.563 5.843-41.47z"},
  {id:'invisible', name:'Invisible', vb:512, fill:true, d:"M260.7 31.1c5.2.51 9.9 2.45 14.5 4.9l9.1-16.3c-6.4-3.81-13.9-6.07-20.7-7.3-.9 6.24-1.9 12.47-2.9 18.7zm-9.1-18.4c-7.6.51-14.1 2.52-21.1 6l8.3 16.7c5.1-1.88 9.6-3.72 14.6-4l-1.8-18.7zm-38.5 18.7c-5 5.17-9.8 11.69-12.7 17l16.3 9.1c3.1-4.71 5.9-9.09 9.6-12.8-4.3-4.46-9-8.78-13.2-13.3zm88.1 1.9l-14 12.4c3.8 3.98 6.6 8.63 9.3 13.4l16.7-8.5c-3.5-6.29-7.8-12.54-12-17.3zM192.4 67.4c-2.1 6.71-3.3 14.19-3.8 20.2l18.6 1.8c.6-6.22 1.4-10.74 3-16.5zm128.2 2.2c-6 1.86-12 3.42-18.1 4.9 1.1 5.58 2.2 11.79 2.7 16.6l18.7-1c-.8-7.04-1.8-14.28-3.3-20.5zm-113.2 36.6l-18.5 1.9c.4 7 2.6 14.3 4.3 20.1l17.8-5.7c-1.7-5.8-2.9-11-3.6-16.3zm97.2 1.7c-.8 5.7-2.4 11.2-4 16.2l17.5 6.6c2.3-6.7 4.1-14 5-20zm-86.7 29.4s-11.5 5.4-16.1 6.7c0 0 4.8 9.6 6.9 17.1 7.6-2.2 15.5-3.2 23.3-4.5-4.7-6.9-10.5-13.4-14.1-19.3zm75.3 1.7c-4.2 6.3-9.2 12-13.9 17.9 7.8 2.1 16 2.7 23.6 5.5 0 0 4.4-12.9 6.1-17.7-5.7-1.9-15.8-5.7-15.8-5.7zm-108.9 12.7c-6.6 4.4-11.1 8.1-16.1 13.4l13.5 12.9c4.6-4.5 7.8-7.5 12.6-10.5zm143.6 2.8l-10.8 15.2c4.6 3.1 8.7 6.9 12.3 11.1l13.9-12.5c-5.4-5.6-9.4-9.8-15.4-13.8zm-172.1 27.4c-3.5 5.7-6.3 11.8-8.7 18l17.4 6.9c2-5.4 4.5-10.7 7.5-15.6zm199.5 3.2l-16.2 9.2c2.8 5.1 5.4 10.4 7.6 15.8L364 203c-2.4-6.2-5.5-12.1-8.7-17.9zm-214.2 33.8c-1.6 6.2-3 12.7-3.8 19.2l18.4 2.8c.8-5.9 2.2-11.7 3.5-17.5zm229.1 3l-18.1 4.8c1.8 5.7 2.6 11.5 3.8 17.4l18.4-3.1c-1.1-6.4-2.3-12.8-4.1-19.1zm-235.1 35.5c-.5 6.8-.6 12.6-.6 19.3h18.7c.1-6.3.2-12.9.6-18zm241.6 2.9l-18.7 1.5c.5 5.8.8 12 .8 18l18.7-.1c-.1-7-.4-13.2-.8-19.4zm-223 34.6l-18.7 1c.4 6.4 1 12.7 1.7 19.1l18.6-2c-.8-6-1.2-12.1-1.6-18.1zm204.5 2.9c-.2 6-1 12-1.7 18l18.5 2.4c1-6.3 1.4-12.7 1.9-19.1zM139 329.6c.5 6.3 2 12.9 2.9 18.3h20.3v-18.7c-7.7-.2-15.4.1-23.2.4zm41.9-.4c-.1 6.4 0 12.3 0 18.7l19.2-.5c-.5-6.1-.9-12.1-1.2-18.2zm130 0c-.5 6.3-1 12.7-1.5 19l18.7 1.4-.2-20.4zm35.7 0v18.7h23.2c1.3-6.4 2.3-11.6 3.4-18-8.8-.9-17.7-.7-26.6-.7zm-145.3 36.9l-18.6 1.2 1.2 18.7 18.6-1.3zm106.7.7l-1.3 18.6 18.6 1.4 1.4-18.6zm-60.2 11.9v18.7h18.6v-18.7zm-44 24.7l-18.7 1.2 1.3 18.7L205 422zm101.5.7l-1.4 18.6 18.6 1.4 1.4-18.6zm-57.5 12v18.7h18.6v-18.7zm-41.6 24.6l-18.6 1.2 1.2 18.7 18.7-1.3zm96.3.6l-1.4 18.7 18.6 1.4 1.4-18.7zm-54.7 12.2v18.7h18.6v-18.7zM208.7 478l-18.7 1.2c.5 6.8.9 13.6 1.4 20.4h15.7zm91 .6l.8 21h16.4c.4-6.5 1-13.1 1.5-19.6zm-73.9 2.3v18.7h18.6v-18.7zm37.3 0v18.7h18.7v-18.7z"},
  {id:'petrified', name:'Petrified', vb:512, fill:true, d:"M209.875 44.156l-182 106.47 119.625 54.31 148.344 11.72 41.97-24.312 17.342 11.562L309 230.656V379.53l53.563-14.624-64.625 51.97-110.875-59.626-2.157-1.53-71.28 6.56 75.936-31.967 100.75 52.125v-147.5l-145.906-11.5-1.625-.125-1.5-.688-121.093-55V391.47L44 423.186l82 20.97 21.875-21.282 11.156 29.72 131.282 33.592V434l4.25 2.28 5.47 2.94 4.812-3.908L309 431.97v52.155L491.375 377.78v-96.405L466.78 269.47l24.595-38.75V125l-90.25 52.28-1.094 34.095-88-58.688 84.97 5.375L476.5 112 291.562 64.937l1.625.563-64.406 5.78 5.345-20.936-24.25-6.188z"},
  {id:'poisoned', name:'Poisoned', vb:512, fill:true, d:"M270.2 18.8c-68.96 0-117.89 37.757-150.52 83.475-32.63 45.72-47.784 100.002-47.784 126.096 0 7.612 3.726 15.27 12.31 23.292 8.586 8.023 21.87 15.846 38.74 22.432 18.64 7.276 41.623 13.058 67.406 16.79l-.33 3.72 18.62 1.646 9.516-107.686-18.615-1.646-2.754 31.148c-31.007-14.07-53.424-41.094-54.054-83.242-.85-56.927 64.165-87.918 127.287-87.795 59.298.115 116.925 27.69 116.713 87.01-.098 27.788-14.5 50.374-36.256 66.63l-6.384-24.307-18.076 4.748 29.334 111.667 18.076-4.748-1.9-7.23c7.77-2.243 15.084-4.69 21.824-7.33 17.102-6.698 30.64-14.594 39.404-22.587 8.764-7.994 12.486-15.507 12.486-22.512v-.034c-.01-26.633-12.86-80.858-41.45-126.53-28.605-45.69-71.63-83.007-133.595-83.007zm67.036 64.294c-5.587-.138-13.008 2.493-23.076 8.93-58.69 37.536-5.446 55.464 43.567 29.122-3.91-19.254-6.212-37.7-20.49-38.052zM192.313 94.902c-20.66-.172-18.595 21.602-18.366 44.854 57.036 16.586 108.632-13.985 39.002-40.106-8.627-3.235-15.37-4.704-20.637-4.748zm75.87 39.088c-14.55 13.363-24.763 37.98 1.538 38.473 31.216.58 13.18-24.787-1.538-38.473zm34.672 52.354l-18.45 2.974 17.702 109.8 18.452-2.973-17.705-109.8zm-41.558 6.03l-18.688.272 1.507 103.58 18.686-.27-1.506-103.58zM298.11 312.68c-13.058 1.063-26.557 1.62-40.37 1.62-11.565 0-22.874-.394-33.894-1.114-1.046 2.546-2.07 5.125-3.06 7.744-9.086 24.038-15.855 50.798-18.893 74.26-3.04 23.465-1.766 43.903 2.466 53.273 9.582 21.216 24.987 33.124 42.806 39.103 17.82 5.978 38.156 5.56 55.707.673 17.55-4.887 32.02-14.397 38.58-24.24 6.56-9.843 7.395-18.81-3.062-31.353-37.982-45.556-40.875-87.474-40.3-119.045.006-.32.015-.603.02-.92z"},
  {id:'prone', name:'Prone', vb:512, fill:true, d:"M221.313 16a23.682 23.695 0 0 0-23.688 23.688v106.406a23.682 23.695 0 0 0 2.156 9.72 23.682 23.695 0 0 0 3.157 13.81l41.75 71.626-79 55.438 6.094-48.625a23.682 23.695 0 0 0-8.186-20.97l-66.28-81.937a23.682 23.695 0 0 0-33.314-3.5l-9.188 7.438a23.682 23.695 0 0 0-3.53 33.344l59.78 73.906-11.25 89.937a23.682 23.695 0 0 0 12.47 23.876l37.468 53.47a23.695 23.682 1.57 0 0 2.344 2.812 23.682 23.695 0 0 0 13.594 20.062L262 491.53a23.682 23.695 0 0 0 9.97 2.22 23.682 23.695 0 0 0 23.53-2.063l87.156-60.937a23.682 23.695 0 0 0 5.844-33l-6.78-9.688a23.682 23.695 0 0 0-32.97-5.875l-72.406 50.657-59.063-27.625 120.595-84.626a23.695 23.682 1.57 0 0 5.53-5.5 23.682 23.695 0 0 0 14.626-13.594l37.22-91.53 87.813-44.845a23.694 23.682 1.18 0 0 10.312-31.875L488 122.687a23.694 23.682 1.18 0 0-31.875-10.343l-94.688 48.375a23.694 23.682 1.18 0 0-9.843 9.436 23.682 23.695 0 0 0-8.344 10.47l-27.375 67.31-5.22-7.436a23.682 23.695 0 0 0-3-8.844l-50.81-87.094V39.688A23.682 23.695 0 0 0 233.154 16h-11.843zM77.75 376A59.994 60 0 0 0 16 436a59.994 60 0 1 0 120 0 59.994 60 0 0 0-58.25-60z"},
  {id:'apresado', name:'Restrained', vb:512, fill:true, d:"M81 17.656v15.22c-11.175 4.177-18.906 15.608-18.906 28.343 0 12.734 7.73 24.165 18.906 28.343v23.374c-11.175 4.178-18.906 15.61-18.906 28.344 0 12.736 7.73 24.167 18.906 28.345v24.47c-11.175 4.177-18.906 15.607-18.906 28.343 0 12.735 7.73 24.165 18.906 28.343v20.407l-15.875-4.03-43.063 120.906c-.01.034-.022.06-.03.093-2.42 9.276-.887 15.685 2.374 20.656 3.274 4.99 8.77 8.62 15.063 10.188 6.292 1.567 13.143.948 18.686-1.844 5.544-2.79 10.056-7.47 12.438-15.906l.125-.438.155-.406 26.28-67.75 3.064-7.875 8.155 2.25 54.875 15.19 5.656 1.56 1.063 5.72 26.624 143.625h15.5v.063h89.594v-.063h15.406L343.72 349.5l1.06-5.72 5.658-1.56 54.875-15.19 8.156-2.25 3.06 7.876 26.283 67.75.156.406.124.438c2.382 8.437 6.862 13.115 12.406 15.906 5.544 2.792 12.425 3.41 18.72 1.844 6.292-1.567 11.787-5.198 15.06-10.188 3.263-4.97 4.797-11.38 2.376-20.656l-.03-.094-43.063-120.906-14.563 3.72V250.78c11.184-4.177 18.938-15.607 18.938-28.343 0-12.735-7.754-24.165-18.938-28.343v-24.47c11.184-4.177 18.938-15.608 18.938-28.343 0-12.734-7.754-24.165-18.938-28.343V89.564c11.184-4.178 18.938-15.61 18.938-28.344 0-12.736-7.754-24.167-18.938-28.345v-15.22h-18.688v15.22c-11.175 4.178-18.906 15.61-18.906 28.344 0 12.734 7.73 24.165 18.906 28.343v23.374c-11.175 4.178-18.906 15.61-18.906 28.344 0 12.736 7.73 24.167 18.906 28.345v24.47c-11.175 4.177-18.906 15.607-18.906 28.343 0 12.735 7.73 24.165 18.906 28.343v24.845l-84.093 21.438c.79 4.353 1.217 8.83 1.217 13.406 0 41.343-33.718 75.06-75.062 75.06-41.344 0-75.063-33.717-75.063-75.06 0-4.49.426-8.88 1.188-13.158l-84.406-21.5h.594v-25.03c11.183-4.18 18.937-15.61 18.937-28.345s-7.754-24.165-18.938-28.343v-24.47c11.184-4.177 18.938-15.608 18.938-28.343 0-12.734-7.754-24.165-18.938-28.343V89.564c11.184-4.178 18.938-15.61 18.938-28.344 0-12.736-7.754-24.167-18.938-28.345v-15.22H81zm9.344 32.22c4.922 0 9.594 4.528 9.594 11.343 0 6.813-4.673 11.343-9.594 11.343-4.92 0-9.563-4.53-9.563-11.344 0-6.816 4.642-11.345 9.564-11.345zm334.312 0c4.922 0 9.594 4.528 9.594 11.343 0 6.813-4.673 11.343-9.594 11.343-4.92 0-9.562-4.53-9.562-11.344 0-6.816 4.64-11.345 9.562-11.345zm-334.312 80.06c4.922 0 9.594 4.53 9.594 11.345 0 6.816-4.673 11.345-9.594 11.345-4.92 0-9.563-4.53-9.563-11.344 0-6.813 4.642-11.343 9.564-11.343zm334.312 0c4.922 0 9.594 4.53 9.594 11.345 0 6.816-4.673 11.345-9.594 11.345-4.92 0-9.562-4.53-9.562-11.344 0-6.813 4.64-11.343 9.562-11.343zM90.344 211.096c4.922 0 9.594 4.53 9.594 11.344 0 6.814-4.673 11.343-9.594 11.343-4.92 0-9.563-4.528-9.563-11.343 0-6.814 4.642-11.343 9.564-11.343zm334.312 0c4.922 0 9.594 4.53 9.594 11.344 0 6.814-4.673 11.343-9.594 11.343-4.92 0-9.562-4.528-9.562-11.343 0-6.814 4.64-11.343 9.562-11.343zm-167.28 43c-31.245 0-56.376 25.13-56.376 56.375 0 19.348 9.646 36.356 24.406 46.5v-19.626h18.688v27.906c4.257 1.02 8.702 1.594 13.28 1.594 4.782 0 9.418-.61 13.845-1.72v-27.78h18.686v19.22c14.44-10.188 23.844-26.995 23.844-46.095 0-31.245-25.13-56.376-56.375-56.376z"},
  {id:'unconscious', name:'Unconscious', vb:512, fill:true, d:"M264.438 17.094c-65.792 0-122.042 41.78-145.625 93.406-20.03 34.082-31.844 74.992-31.844 118 0 73.852 20.417 140.625 52.81 188.406 32.395 47.78 76.155 76.28 123.845 76.28 47.69.002 91.45-28.5 123.844-76.28 32.393-47.78 52.81-114.555 52.81-188.406 0-41.823-10.428-80.8-28.31-113.53-22.305-53.66-79.854-97.876-147.533-97.876zm0 18.687c72.458 0 132.256 60.305 138.25 117.564H267.063l-6.22-22.625-9-32.782-9 32.78-10.5 38.22-16.843-61.282-9.03-32.78-9 32.78L185 152.97h-58.813c6.22-57.147 65.95-117.19 138.25-117.19zm-57.97 109.657l16.845 61.25 9.03 32.782 9-32.782 10.5-38.25 1 3.593h149.812c-5.967 55.655-64.63 101.032-138.22 101.032-73.752 0-132.567-45.58-138.31-101.406h73.124l1.906-6.875 5.313-19.343zm-71.78 139.407c18.355 18.096 37.527 26.734 55.718 27.53 18.192.798 35.928-6.095 52.125-21.5l12.876 13.563c-19.213 18.273-42.28 27.657-65.844 26.625-23.562-1.03-47.1-12.333-68-32.937l13.126-13.28zm264.75 0l13.125 13.28c-20.898 20.605-44.438 31.907-68 32.938-23.563 1.032-46.63-8.352-65.844-26.625l12.874-13.562c16.198 15.404 33.965 22.297 52.156 21.5 18.19-.797 37.333-9.435 55.688-27.53zM266.53 419.594c26.456-.068 52.92 3.186 79.345 10.03l-4.688 18.095c-49.808-12.902-99.402-12.4-149.375.03l-4.53-18.125c26.343-6.552 52.795-9.964 79.25-10.03z"},
  {id:'paralyzed', name:'Paralyzed', vb:512, fill:true, d:"M263.47 19.03c-1.234.04-2.47.126-3.69.126-38.983 0-70.75 33.895-70.75 75.906 0 21.274 8.43 40.465 21.5 54.282-80.868 10.566-98.35 105.42-79.124 191.562h31.656l-1.03-105.344 18.687-.187 1.25 129.25 10.218 130.313h55.53V319.344h18.688v175.594h56.22l12.687-143.313 1.125-116.25 18.687.188-1.03 105.343h33.5c21.795-88.46-5.595-178.95-79.626-190.687 13.658-13.88 22.53-33.346 22.53-55.157 0-39.39-27.808-72.008-63.406-75.907-1.187-.15-2.393-.162-3.625-.125zM248.28 36.5l12.25 35.03 25.095-27-18.594 44.845 44.22-9.125-29.094 19.313 21.594 12.28-34.47 1.75 20.908 38.563-26.375-15.78-10.907 20.03 15.22 27.844 42.343-12.28-29.94 35.874 57-9.063-39.217 34.47 18.5 42.47-22.782-5.19 22.345 104.876-53.656-101.97-62.095 67.814 35.813-90.28-32.813 10 22.22-34.94-49.814-24 54.72.345-27.28-31.78 37.28 9.686.625-52.06-25.125 3.686L241.844 99 211 74.406l31.438 3.563 5.843-41.47z"},
  {id:'stunned', name:'Stunned', vb:512, fill:true, d:"M263.47 19.03c-1.234.04-2.47.126-3.69.126-38.983 0-70.75 33.895-70.75 75.906 0 21.274 8.43 40.465 21.5 54.282-80.868 10.566-98.35 105.42-79.124 191.562h31.656l-1.03-105.344 18.687-.187 1.25 129.25 10.218 130.313h55.53V319.344h18.688v175.594h56.22l12.687-143.313 1.125-116.25 18.687.188-1.03 105.343h33.5c21.795-88.46-5.595-178.95-79.626-190.687 13.658-13.88 22.53-33.346 22.53-55.157 0-39.39-27.808-72.008-63.406-75.907-1.187-.15-2.393-.162-3.625-.125zM248.28 36.5l12.25 35.03 25.095-27-18.594 44.845 44.22-9.125-29.094 19.313 21.594 12.28-34.47 1.75 20.908 38.563-26.375-15.78-10.907 20.03 15.22 27.844 42.343-12.28-29.94 35.874 57-9.063-39.217 34.47 18.5 42.47-22.782-5.19 22.345 104.876-53.656-101.97-62.095 67.814 35.813-90.28-32.813 10 22.22-34.94-49.814-24 54.72.345-27.28-31.78 37.28 9.686.625-52.06-25.125 3.686L241.844 99 211 74.406l31.438 3.563 5.843-41.47z"},
];
const CONDITION_MAP = Object.fromEntries(CONDITIONS.map(c=>[c.id,c]));
const ICONS = new Map();
/* Rasterize each icon on its own canvas: a Path2D created in this window is not always
   valid in the table window's context, which caused icons to disappear there. */
function conditionIcon(id, color, px){
  const c=CONDITION_MAP[id]; if(!c) return null;
  const key=id+'|'+color+'|'+px;
  if(ICONS.has(key)) return ICONS.get(key);
  const cn=document.createElement('canvas'); cn.width=px; cn.height=px;
  const x=cn.getContext('2d');
  x.scale(px/c.vb, px/c.vb);
  const path=new Path2D(c.d);
  if(c.fill){ x.fillStyle=color; x.fill(path); }
  else { x.strokeStyle=color; x.lineWidth=c.vb/13; x.lineCap='round'; x.lineJoin='round'; x.stroke(path); }
  ICONS.set(key,cn); return cn;
}
const condSvg = id => {
  const c=CONDITION_MAP[id]; if(!c) return '';
  const p = c.fill ? '<path fill="currentColor" stroke="none" d="'+c.d+'"/>'
                   : '<path fill="none" stroke="currentColor" d="'+c.d+'"/>';
  return '<svg viewBox="0 0 '+c.vb+' '+c.vb+'">'+p+'</svg>';
};

/* Keep the turn with the combatant, not with the row position. */
function turnIdx(){
  const i=S.ini.list.findIndex(m=>m.id===S.ini.turnId);
  return i<0 ? 0 : i;
}
function sortInitiative(){
  S.ini.list.sort((a,b)=>(b.init-a.init) || a.name.localeCompare(b.name));
  if(!S.ini.list.some(m=>m.id===S.ini.turnId)) S.ini.turnId = S.ini.list.length ? S.ini.list[0].id : null;
}
const hasCond = (m,id) => !!(m.conditions && m.conditions.includes(id));
function toggleCond(m,id){
  m.conditions = m.conditions || [];
  const i=m.conditions.indexOf(id);
  if(i<0) m.conditions.push(id); else m.conditions.splice(i,1);
  syncPlayer(m);
  renderInitiativeList(); draw();
}

/* --- damage, healing, and temporary HP --- */
function pushIniUndo(){ push('ini'); }
function syncAll(){ S.ini.list.forEach(syncPlayer); }
function undoIni(){ undo(); }
function applyDamage(m, amount, queue){
  if(amount<=0) return;
  const alreadyDown = m.hpMax>0 && (m.hp||0)<=0 && m.type!=='enemy';
  const absorbed = Math.min(m.temp||0, amount);
  m.temp = (m.temp||0) - absorbed;
  const rest = amount - absorbed;
  if(rest>0) m.hp = Math.max(0, (m.hp||0) - rest);
  if(m.hp===0){
    if(m.type!=='enemy'){
      m.conditions = m.conditions || [];
      if(!m.conditions.includes('unconscious')) m.conditions.push('unconscious');
    }
    if(hasCond(m,'concentration')) toggleCondSilent(m,'concentration');
    /* Taking damage while already at zero counts as a failed death save. */
    if(alreadyDown) recordSave(m, 2);
  } else if(hasCond(m,'concentration') && amount>0){
    const cd = Math.min(30, Math.max(10, Math.floor(amount/2)));
    queue.push({m, cd, dmg:amount});
  }
}
/* Three successes stabilize; three failures kill. Previously the marks only cycled and
   the DM had to keep count mentally. */
function savingThrowState(m){
  const sv=m.saves||[];
  const ok=sv.filter(v=>v===1).length, ko=sv.filter(v=>v===2).length;
  return ko>=3 ? 'dead' : ok>=3 ? 'stable' : null;
}
function recordSave(m, value){
  m.saves = m.saves || [0,0,0,0,0,0];
  const i = m.saves.indexOf(0);
  if(i>=0) m.saves[i]=value;
}

function toggleCondSilent(m,id){
  m.conditions=m.conditions||[]; const i=m.conditions.indexOf(id); if(i>=0) m.conditions.splice(i,1);
}
function applyHeal(m, amount){
  if(amount<=0) return;
  const was0 = m.hp<=0;
  m.hp = Math.min(m.hpMax>0 ? m.hpMax : (m.hp||0)+amount, (m.hp||0) + amount);
  if(was0 && m.hp>0){
    m.saves=[0,0,0,0,0,0];
    toggleCondSilent(m,'unconscious');
  }
}
function applyTemp(m, amount){ m.temp = Math.max(m.temp||0, amount); }

function applyTo(m, mode, amount){
  pushIniUndo();
  const queue=[];
  if(mode==='dmg') applyDamage(m, amount, queue);
  else if(mode==='heal') applyHeal(m, amount);
  else applyTemp(m, amount);
  syncPlayer(m);
  renderInitiativeList(); draw();
  if(queue.length) showConc(queue);
  const end=savingThrowState(m);
  if(mode==='dmg' && end==='dead') toast(m.name+' has failed three death saves.');
}

/* --- concentration notice --- */
let concQueue=[];
function showConc(q){
  concQueue=q;
  nextConc();
}
function nextConc(){
  if(!concQueue.length){ $('conc').classList.add('hide'); return; }
  const c=concQueue[0];
  $('concTxt').innerHTML = '<b>'+c.m.name+'</b> took '+c.dmg+' damage and must succeed on a '+
    '<b>DC '+c.cd+'</b> Constitution saving throw to keep concentration.';
  $('conc').classList.remove('hide');
}
$('concOk').onclick=()=>{ concQueue.shift(); nextConc(); };
$('concFail').onclick=()=>{
  const c=concQueue.shift();
  if(c) toggleCondSilent(c.m,'concentration');
  renderInitiativeList(); draw(); nextConc();
};

/* --- DM list --- */
function renderInitiativeList(){
  touchState();
  sortInitiative();
  const box=$('initiativeList'); box.innerHTML='';
  const ti=turnIdx();
  S.ini.list.forEach((m,i)=>{
    const row=document.createElement('div');
    const down = m.hpMax>0 && m.hp<=0;
    row.className='ini'+(i===ti?' turn':'')+(down?' down':'')+(m.id===S.ini.selId?' sel':'');

    const pos=document.createElement('div'); pos.className='pos'; pos.textContent=(i+1);
    const iv=document.createElement('div'); iv.className='iv'; iv.textContent=m.init;
    const dot=document.createElement('div'); dot.className='dot';
    dot.style.background = m.type==='pj' ? PAL.measure : m.type==='ally' ? PAL.frame : PAL.danger;

    const nm=document.createElement('div'); nm.className='nm';
    nm.appendChild(document.createTextNode(m.name));
    if(m.conditions && m.conditions.length){
      const cd=document.createElement('span'); cd.className='cd';
      m.conditions.forEach(id=>{
        if(!CONDITION_MAP[id]) return;
        const ico=document.createElement('span');
        ico.innerHTML=condSvg(id);
        attachTip(ico, CONDITION_MAP[id].name);
        cd.appendChild(ico);
      });
      nm.appendChild(cd);
    }

    const bar=document.createElement('div'); bar.className='bar';
    if(m.hpMax>0){
      const total=m.hpMax+(m.temp||0);
      const f=Math.max(0,m.hp)/total, tf=(m.temp||0)/total;
      const frac=Math.max(0,Math.min(1,m.hp/m.hpMax));
      const hpi=document.createElement('i'); hpi.style.width=(f*100)+'%';
      hpi.style.background = frac>0.5?PAL.frame:frac>0.25?PAL.fog:PAL.danger;
      bar.appendChild(hpi);
      if(tf>0){ const tpi=document.createElement('i'); tpi.className='tp';
        tpi.style.left=(f*100)+'%'; tpi.style.width=(tf*100)+'%'; bar.appendChild(tpi); }
    }
    const hp=document.createElement('div'); hp.className='hp';
    hp.textContent = m.hpMax>0 ? (m.hp+'/'+m.hpMax+((m.temp>0)?' +'+m.temp:'')) : '—';

    const ed=document.createElement('button'); ed.className='ed'; ed.textContent='✎'; ed.title='Edit';
    ed.onclick=ev=>{ ev.stopPropagation(); openCombatant(m); };
    const del=document.createElement('button'); del.className='x'; del.textContent='×'; del.title='Remove';
    del.onclick=ev=>{
      ev.stopPropagation();
      /* Removing a combatant also removes its hit points, conditions, and saves. It does
         not ask for confirmation because this is common, but history lets Ctrl+Z restore it all. */
      pushIniUndo();
      S.ini.list.splice(i,1);
      if(m.id===S.ini.turnId) S.ini.turnId = S.ini.list.length ? S.ini.list[Math.min(i,S.ini.list.length-1)].id : null;
      if(m.id===S.ini.selId) S.ini.selId=null;
      renderInitiativeList(); draw();
      toast(m.name+' removed. Ctrl+Z to bring them back.');
    };
    row.onclick=()=>{ S.ini.selId = (S.ini.selId===m.id) ? null : m.id; clearEntry(); renderInitiativeList(); };
    row.append(pos,iv,dot,nm,bar,hp,ed,del);
    box.appendChild(row);
    if(m.id===S.ini.selId) box.appendChild(buildStrip(m));
  });
  $('initiativeHint').style.display = S.ini.list.length ? 'none' : 'block';
}

function buildStrip(m){
  const st=document.createElement('div'); st.className='strip';

  const modes=document.createElement('div'); modes.className='modes';
  const mk=(key,label,cls)=>{
    const b=document.createElement('button'); b.textContent=label; b.className=cls+(S.ini.mode===key?' on':'');
    b.onclick=()=>{ S.ini.mode=key; renderInitiativeList(); };
    return b;
  };
  modes.append(mk('dmg','Damage','dmg'), mk('heal','Heal','heal'), mk('temp','Temp','temp'));

  const ap=document.createElement('div'); ap.className='apply';
  const inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.placeholder='0';
  const go=document.createElement('button'); go.textContent='Apply';
  go.onclick=()=>{ const v=Math.abs(parseInt(inp.value)||0); if(!v) return;
    applyTo(m, S.ini.mode||'dmg', v); inp.value=''; };
  inp.onkeydown=ev=>{ ev.stopPropagation(); if(ev.key==='Enter') go.click(); };
  ap.append(inp,go);

  const cs=document.createElement('div'); cs.className='conds';
  CONDITIONS.forEach(c=>{
    const b=document.createElement('button');
    b.innerHTML=condSvg(c.id);
    attachTip(b, c.name);
    if(hasCond(m,c.id)) b.classList.add('on');
    b.onclick=()=>toggleCond(m,c.id);
    cs.appendChild(b);
  });

  st.append(modes,ap,cs);

  if(m.hpMax>0 && m.hp<=0 && m.type!=='enemy'){
    m.saves = m.saves || [0,0,0,0,0,0];
    const sv=document.createElement('div'); sv.className='saves';
    const lb=document.createElement('span'); lb.textContent='Death saves';
    /* Show the outcome beside the save marks; this row should eliminate counting three
       by eye. */
    const end=document.createElement('b');
    const drawEnd=()=>{
      const e=savingThrowState(m);
      end.textContent = e==='dead' ? 'Dead' : e==='stable' ? 'Stable' : '';
      end.style.color = e==='dead' ? 'var(--danger)' : 'var(--frame)';
      end.style.marginLeft='auto';
    };
    drawEnd();
    const pips=document.createElement('div'); pips.className='pips';
    m.saves.forEach((v,i)=>{
      const b=document.createElement('button');
      b.className='pip'+(v===1?' ok':v===2?' ko':'');
      b.title='Empty → success → failure';
      b.onclick=()=>{
        m.saves[i]=(m.saves[i]+1)%3;
        const before=savingThrowState(m);
        syncPlayer(m); renderInitiativeList();
        if(before==='dead') toast(m.name+' is dead.');
        else if(before==='stable') toast(m.name+' is stable.');
      };
      pips.appendChild(b);
    });
    sv.append(lb,pips,end); st.appendChild(sv);
  }
  return st;
}

/* --- keyboard input --- */
function clearEntry(){ S.ini.entry=null; $('entry').style.display='none'; }
function showEntry(){
  const e=S.ini.entry;
  if(!e || !S.ini.selId){ clearEntry(); return; }
  const m=S.ini.list.find(x=>x.id===S.ini.selId);
  const label = e.mode==='heal' ? 'Heal' : e.mode==='temp' ? 'Temp HP' : 'Damage';
  $('entry').innerHTML = (m?m.name+' · ':'')+label+' <b>'+(e.buf||'0')+'</b>';
  $('entry').style.display='block';
}
function entryKey(k){
  const m=S.ini.list.find(x=>x.id===S.ini.selId);
  if(!m) return false;
  if(/^[0-9]$/.test(k)){
    if(!S.ini.entry) S.ini.entry={mode:'dmg',buf:''};
    S.ini.entry.buf=(S.ini.entry.buf+k).slice(0,4); showEntry(); return true;
  }
  if(k==='+'){ S.ini.entry={mode:'heal',buf:''}; showEntry(); return true; }
  if(k==='-'){ S.ini.entry={mode:'dmg',buf:''}; showEntry(); return true; }
  if(k==='t' && !S.ini.entry){ S.ini.entry={mode:'temp',buf:''}; showEntry(); return true; }
  if(k==='t' && S.ini.entry){ S.ini.entry.mode='temp'; showEntry(); return true; }
  if(k==='backspace' && S.ini.entry){ S.ini.entry.buf=S.ini.entry.buf.slice(0,-1); showEntry(); return true; }
  if(k==='enter' && S.ini.entry){
    const v=parseInt(S.ini.entry.buf)||0;
    const mode=S.ini.entry.mode;
    clearEntry();
    if(v>0) applyTo(m, mode, v);
    return true;
  }
  return false;
}

/* --- apply to multiple combatants --- */
let multiState={};
function openMulti(){
  if(!S.ini.list.length){ toast('No combatants.'); return; }
  multiState={};
  $('multiAmt').value=0;
  renderMulti();
  $('multi').classList.remove('hide');
  setTimeout(()=>$('multiAmt').focus(),30);
}
function renderMulti(){
  const box=$('multiList'); box.innerHTML='';
  S.ini.list.forEach(m=>{
    const row=document.createElement('div'); row.className='multi';
    const dot=document.createElement('div'); dot.className='dot';
    dot.style.cssText='width:9px;height:9px;border-radius:2px;flex:none;background:'+
      (m.type==='pj'?PAL.measure:m.type==='ally'?PAL.frame:PAL.danger);
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=m.name;
    const st=multiState[m.id]||0;
    const b=document.createElement('button');
    b.textContent = st===0 ? 'No' : st===1 ? 'Full' : 'Half';
    b.className = st===1?'full':st===2?'half':'';
    b.onclick=()=>{ multiState[m.id]=((multiState[m.id]||0)+1)%3; renderMulti(); };
    row.append(dot,nm,b); box.appendChild(row);
  });
}
function applyMulti(){
  const amt=Math.abs(parseInt($('multiAmt').value)||0);
  if(!amt){ $('multi').classList.add('hide'); return; }
  pushIniUndo();
  const queue=[];
  S.ini.list.forEach(m=>{
    const st=multiState[m.id]||0;
    if(st===1) applyDamage(m, amt, queue);
    else if(st===2) applyDamage(m, Math.floor(amt/2), queue);
  });
  $('multi').classList.add('hide');
  syncAll();
  renderInitiativeList(); draw();
  if(queue.length) showConc(queue);
}
$('btnMulti').onclick=openMulti;
$('multiCancel').onclick=()=>$('multi').classList.add('hide');
$('multiApply').onclick=applyMulti;
$('multi').onclick=e=>{ if(e.target===$('multi')) $('multi').classList.add('hide'); };
$('multi').addEventListener('keydown',e=>{ e.stopPropagation();
  if(e.key==='Enter') applyMulti(); if(e.key==='Escape') $('multi').classList.add('hide'); });
$('btnUndoDamage').onclick=undoIni;

function nextTurn(){
  if(!S.ini.list.length) return;
  const n=turnIdx()+1;
  /* Wrap back to the first combatant after the last. */
  if(n>=S.ini.list.length) S.ini.turnId=S.ini.list[0].id;
  else S.ini.turnId=S.ini.list[n].id;
  renderInitiativeList(); draw();
}

/* --- combatant dialog --- */
let mdTarget=null, mdType='enemy';
function setMdType(t){
  mdType=t;
  document.querySelectorAll('#mdSeg button').forEach(b=>b.classList.toggle('on', b.dataset.type===t));
}
function openCombatant(m){
  mdTarget=m||null;
  $('mdTitle').textContent = m ? 'Edit combatant' : 'New combatant';
  $('mdName').value = m ? m.name : '';
  $('mdInit').value = m ? m.init : 10;
  $('mdHp').value   = m ? m.hp : 10;
  $('mdMax').value  = m ? m.hpMax : 10;
  $('mdAdj').value  = '';
  setMdType(m ? m.type : 'enemy');
  $('modal').classList.remove('hide');
  setTimeout(()=>$('mdName').focus(),30);
}
function closeCombatant(){ $('modal').classList.add('hide'); mdTarget=null; }
function saveCombatant(){
  const name=($('mdName').value||'').trim() || 'Combatant';
  const init=parseInt($('mdInit').value)||0;
  const max=Math.max(0,parseInt($('mdMax').value)||0);
  const adj=parseInt($('mdAdj').value);
  let hp=Math.max(0,parseInt($('mdHp').value)||0);
  if(!isNaN(adj)) hp=Math.max(0, Math.min(max||Infinity, hp+adj));
  if(mdTarget){ Object.assign(mdTarget,{name,init,hp,hpMax:max,type:mdType}); syncPlayer(mdTarget); }
  else{
    const m={id:newInitiativeId(),name,init,hp,hpMax:max,temp:0,type:mdType,conditions:[],saves:[0,0,0,0,0,0]};
    S.ini.list.push(m);
    if(!S.ini.turnId) S.ini.turnId=m.id;
  }
  closeCombatant(); renderInitiativeList(); draw();
}
document.querySelectorAll('#mdSeg button').forEach(b=>b.onclick=()=>setMdType(b.dataset.type));
$('mdCancel').onclick=closeCombatant;
$('mdSave').onclick=saveCombatant;
$('modal').onclick=e=>{ if(e.target===$('modal')) closeCombatant(); };
$('modal').addEventListener('keydown', e=>{
  e.stopPropagation();
  if(e.key==='Enter') saveCombatant();
  if(e.key==='Escape') closeCombatant();
});

  return { CONDITIONS, CONDITION_MAP, conditionIcon, turnIdx, syncAll, renderInitiativeList, pushIniUndo, entryKey, clearEntry, nextTurn, openCombatant };
}
