<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header>
    <nav>
      <RouterLink to="/">
        <img width="48" height="48" src="https://img.icons8.com/fluency/48/home.png" alt="home" />
      </RouterLink>
      <RouterLink to="/map"
        ><img
          width="48"
          height="48"
          src="https://img.icons8.com/fluency/48/map-marker.png"
          alt="map-marker"
      /></RouterLink>
      <RouterLink to="/data"
        ><img
          width="48"
          height="48"
          src="https://img.icons8.com/fluency/48/bar-chart.png"
          alt="bar-chart"
      /></RouterLink>
    </nav>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  text-align: center;
  margin-bottom: 1rem;
}

nav a.router-link-exact-active {
  border-bottom: 5px solid hsl(160, 100%, 37%);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-flex;
  align-items: center;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
