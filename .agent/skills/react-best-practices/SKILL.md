---
name: react-best-practices
description: >-
  Use this skill whenever writing, refactoring, or optimizing React components, hooks,
  data fetching, and state management. Prevents performance bottlenecks, waterfalls,
  unnecessary re-renders, and memory leaks.
---

# React Best Practices & Performance Optimization

Esta skill recopila los estándares de ingeniería de alto rendimiento para aplicaciones React modernas con TypeScript.

---

## 1. Prevención de Waterfalls de Datos (Parallel Data Fetching)
- **El error:** Encadenar peticiones asíncronas secuenciales innecesarias que multiplican el tiempo de carga.
- **La regla:** Cargar datos independientes en paralelo utilizando `Promise.all` o listeners simultáneos:
  ```typescript
  // BIEN: En paralelo
  const [userProfile, orders] = await Promise.all([
    getUserProfile(userId),
    getUserOrders(userId),
  ]);
  ```

---

## 2. Gestión de Suscripciones y Memoria (Firestore & WebSockets)
- **Limpieza obligatoria:** Todo `onSnapshot` de Firestore, temporizador o event listener en `useEffect` **DEBE** retornar su función de limpieza (`unsubscribe`).
  ```typescript
  useEffect(() => {
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setData(snapshot.data());
    });
    return () => unsubscribe(); // CRÍTICO: evita fugas de memoria y cobros fantasma
  }, [docRef]);
  ```

---

## 3. Evitar Re-renders Innecesarios
- **Referencias estables:** Usar `useCallback` en funciones pasadas como props a componentes hijos pesados o memoizados (`React.memo`).
- **Cálculos costosos:** Usar `useMemo` para filtrado y ordenamiento de listas grandes en memoria antes de pasarlas a la vista.
- **Evitar objetos en línea:** Nunca pasar objetos o arreglos literales como props en el JSX si causan re-renders en componentes hijos (`style={{ ... }}` o `config={{ ... }}`).

---

## 4. Estado Atómico y Local
- **No sobrecargar el Context:** No almacenes estados de alta frecuencia (como el texto de un input o la posición del scroll) en Providers globales de React Context; mantén el estado en el nodo más bajo posible del árbol.
- **Derivar estado en lugar de duplicar:** Si un valor puede calcularse a partir de props o de otro estado (ej. `total = items.reduce(...)`), calcúlalo en el render, **nunca** crees un `const [total, setTotal] = useState` sincronizado con un `useEffect`.

---

## 5. Accesibilidad y Semántica
- Todo botón sin texto visible (ej. botón con solo un icono de `lucide-react`) debe incluir `aria-label="Descripción de la acción"`.
- Los inputs deben estar asociados a su etiqueta mediante `id` y `htmlFor`.
