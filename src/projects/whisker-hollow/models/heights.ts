// What each model stands at in the world, in metres, by poly.pizza id. Every model is normalised to 1 unit tall, so this is its scale.
export const MODEL_HEIGHTS: Readonly<Record<string, number>> = {
  "81WIGctw3se": 0.17, // Armadillo
  "37B4Oz7HDqC": 0.17, // Armadillo
  "dZ3EWgIsSJQ": 0.15, // Armadillo
  "fozJTmMX5yv": 0.19, // Baby chick
  "7-uNQC5megf": 0.22, // Chick
  "dYKICaHpK0c": 0.5, // Cat
  "6dM1J6f6pm9": 0.42, // Cat
  "dBJgGEu5bHW": 0.35, // Kitten
  "1Ys07E47FNX": 0.44, // Arabian wildcat
  "ejX8KpBw2-V": 0.26, // Ring tailed cat
  "0BnDT3T1wTE": 0.61, // Beagle
  "eQmBaLcGbbE": 0.7, // Poodle
  "3nFLBC3aXen": 0.39, // Puppy
  "bKiASi6XMsR": 0.67, // Shiba inu
  "4ioK8LxVtuP": 0.46, // Dog
  "cjsAptT6P9b": 0.5, // Dog
  "5ttSZIlA0t6": 0.58, // Dog
  "baWJfMjFFC2": 0.54, // Dog
  "24WsfFi7Q8s": 0.33, // Dog
  "07qH3gO5K8L": 0.8, // Dog
  "eDmSVe4TKwF": 0.63, // Dog
  "3fn1S0FAyCI": 0.46, // Dog
  "bIG-wEodRRS": 0.7, // Dog
  "83Ha6EKTaOv": 0.66, // Dog
  "0GiSxpS79Ao": 0.13, // Chipmunk
  "794lutNHni-": 0.38, // Squirrel
  "fQ5KzXoR2uA": 0.28, // Squirrel
  "64Yw0UoayhC": 0.15, // Squirrel
  "caxos24uWC9": 0.23, // Squirrel
  "2WqY_AFEn-M": 0.19, // Squirrel
  "3vvONbRCuEF": 0.4, // Cottontail rabbit
  "9OBTRVYUSmt": 0.32, // Rabbit
  "dyeBDJxhDwP": 0.22, // Rabbit
  "8_ZF1ZGRpk5": 0.39, // Rabbit
  "0s-PwU4ssMx": 0.45, // Rabbit
  "biNOm96olTH": 0.55, // Jackrabbit
  "fnO8bkcjBC3": 0.07, // Desert shrew
  "4I1SBFHWuSo": 0.24, // Ferret
  "4fUZKhsSs42": 0.18, // Long-tailed weasel
  "21aV-tPKz5O": 0.11, // Gerbil
  "aRz6-f8rnMq": 0.15, // Hamster
  "3YtzEQ5TVUP": 0.07, // Hamster
  "cx5OT1s5tZE": 0.11, // Mouse
  "5N7L6S3uIzx": 0.086, // Mouse
  "cWxdxmp7yaE": 0.072, // Mouse
  "4KKE4D2FV1D": 0.07, // Mouse
  "eto2qFhG6XY": 0.07, // Spiny mouse
  "6hsesZHvcPI": 0.1, // Rat
  "24Xnzj_Nmln": 0.1, // Woodrat
  "1sa5fbvBAWu": 0.075, // Kangaroo rat
  "3gcaSUNcs9A": 0.15, // jerboa
  "2IatILCJa3X": 0.35, // Gopher
  "1fi2x6XlYjB": 0.096, // Gopher
  "8UNni5IvK_c": 0.16, // Hedgehog
  "17NdW1sy5PC": 0.49, // Porcupine
  "bf8IDe1qb7u": 0.5, // Skunk
  "2iYORwFng3_": 0.46, // Raccoon
  "5_mL2EUPZ1N": 0.3, // Raccoon
  "8LrB_8snYCX": 0.36, // Raccoon
  "6HpauUCfIAb": 0.43, // Duck
  "c1fo7hQgC6J": 0.43, // Duck
  "4hp6pk_ojG2": 0.46, // Duck
  "cGH2xtNdS4i": 0.25, // Duckling
  "frSLi6b6Vid": 0.44, // Mallard duck
  "8Unya0rw9tR": 0.45, // Hen
  "6NTegstc5Jy": 0.5, // Rooster
  "0Bde17Sy506": 0.19, // Quail
  "3WonMe83zEX": 0.18, // Quail
  "4A0kLzM65Mg": 0.24, // Quail
  "fBXvsC6pe_V": 0.7, // Penguin
  "dfNjMLtO0pd": 0.27, // Parrot
  "dpl7B31PqWX": 0.14, // Parrot
  "35EeLqGHH1y": 0.24, // Parrot
  "frVFwZAW6z3": 0.8, // Macaw
  "7sfRRUS5F_v": 0.8, // Scarlet macaw
  "eoAo21aoZHJ": 0.4, // Owl
  "eSEv3rCMKbg": 0.4, // Barn owl
  "7BGjfcacWkz": 0.4, // Barn Owl
  "dVPHzmMmXlg": 0.35, // Long eared owl
  "4_u3rGdORhG": 0.1, // Sparrow
  "3rTjKefT184": 0.13, // Sparrow
  "0eT216MLaus": 0.17, // Sparrow
  "4uL9XFDcdQK": 0.14, // Sparrow
  "70zu6VzQmL4": 0.13, // Sparrow
  "eVTHotZ9Bc_": 0.13, // Sparrow
  "cdcl5UwlYWd": 0.14, // Western bluebird
  "8-xKRYwdgmL": 0.17, // Woodpecker
  "6b7Ul6MeLrJ": 0.14, // Cactus wren
  "5dl4UWhvuTW": 0.13, // Cliffswallow
  "dRMt6TlNFuV": 0.14, // Curve billed thrasher
  "70NyKFt-vLF": 0.12, // Hummingbird
  "1HreVSktbPG": 0.094, // Hummingbird
  "2jmH3trzPFf": 0.3, // Dove
  "1cF8DTp2sAi": 0.21, // Mourning dove
  "1MIvWQ5Q3R9": 0.5, // Crow
  "5oae0lwh9fF": 0.42, // Raven
  "7eQ51arTYDj": 0.43, // Raven
  "bnpgn6o5qNs": 0.59, // Raven
  "8Ph79kHbt9s": 0.3, // Bird
  "97NtujixdN7": 0.1, // Frog
  "0QZHgL_V-Pj": 0.07, // Frog
  "2szk8HrO0ca": 0.087, // Frog
  "cwyNyIba6WE": 0.085, // Tree frog
  "1KWb99rd8t2": 0.07, // Poison dart frog
  "eqjMAgmr-pM": 0.07, // Salamander
  "2LCcq8vhqJ3": 0.15, // Turtle
  "bXreDp3oSqy": 0.13, // Turtle
  "fklSEvGm1Q8": 0.099, // Turtle
  "c6n73UnGEP4": 0.13, // Turtle
  "aZ_cT-AIu2y": 0.11, // Snail
  "6EajmlUIlza": 0.17, // Slug
  "69TjexgSrS3": 0.14, // Slug
  "dhVeQ7R5nCJ": 0.14, // Slug
  "4V7YbLSe8h-": 0.08, // Slug
  "cJhVqTWYYnr": 0.08, // Slug
  "7ahixVBjj-J": 0.08, // Slug
  "1O5Q4pE8X6e": 0.11, // Crab
  "2DgM36qZW2u": 0.07, // Crab
  "7JIU-w5So3a": 0.1, // Lobster
  "0IceC4Tzcad": 0.13, // Lobster
  "ct4Z0kUIHdT": 0.1, // Crawfish
  "eIZvQyUlkAJ": 0.098, // Crawfish
  "3Y2cocX0ILR": 0.07, // Crayfish
  "3KVWrCWGYMx": 0.061, // Crayfish
  "9mYdDPVI9IC": 0.07, // Crayfish
  "bmtxAjfrpa3": 0.07, // Crayfish
  "6H-0K9IEr56": 0.066, // Starfish
  "d_36p3CahYa": 0.25, // Seahorse
  "fkK7TgvkSVG": 0.25, // Seahorse
  "etCg5GTESNY": 0.16, // Fish
  "aEyLrUMMoUK": 0.12, // Fish
  "3GPUntjwqCa": 0.14, // Goldfish
  "0bOZGc8ONrx": 0.18, // Goldfish
  "3tgZD06mzCe": 0.36, // Pufferfish
  "c307K4BlGr2": 0.2, // Piranha
  "9F8QJKUT77V": 0.58, // Octopus
  "26XWuxd1G4R": 0.23, // Octopus
  "flkOBUVpPHg": 0.34, // Octopus
  "9-b6-yqrwEe": 0.34, // Octopus
  "2177F_NMT--": 0.095, // Bee
  "aaOOAVp0I7p": 0.08, // Bee
  "42S5XD_3C4O": 0.08, // Bumblebee
  "6h7-AWppj5e": 0.08, // Hornet
  "2aKeIJiUspL": 0.083, // Wasp
  "e-maR6CzcKc": 0.08, // Wasp
  "4UdWQxbm0-B": 0.11, // Wasp
  "4yufxgZ1QQ2": 0.08, // Beetle
  "57yNPP6-sV_": 0.08, // Lady bug
  "4K7V5f9ntfu": 0.08, // Ladybug
  "4RkgtgojPCk": 0.08, // Ladybug
  "0k_YwE0g_C9": 0.08, // Ladybug
  "2ZwYwkTVnfG": 0.15, // Butterfly
  "e9NAQQrCbLu": 0.17, // Butterfly
  "814CINpG3H1": 0.06, // Butterfly
  "eZBvUobx7mb": 0.07, // Butterfly
  "64T47O5VHAB": 0.08, // Caterpillar
  "11rgZ0QxZ-F": 0.08, // Caterpillar
  "0myA_BOcZrD": 0.08, // Dragonfly
  "1W4laTqRGyC": 0.08, // Dragonfly
  "3VFH5hQvI8R": 0.1, // Grasshopper
  "aw6LLeYKxp7": 0.14, // Grasshopper
  "e3HTaUWGeWs": 0.11, // Grasshopper
  "0r5WfGCgn_3": 0.21, // Grasshopper
  "7hm1o1I9_ZG": 0.11, // Ant
  "62pbJxCL--t": 0.12, // Ant
  "90PJjBye5ZC": 0.082, // Ant
  "7v2EF8dZgtA": 0.14, // Ant
  "2YvCk4p0xdH": 0.08, // Ant
  "8Ry1m9dbzhK": 0.08, // Red ant
  "c7w1u4mSnXZ": 0.08, // Fly
  "eSCFQN_47V4": 0.079, // Cockroach
  "bH2awp4l6AE": 0.077, // Centipede
  "8C36B7L_2hR": 0.06, // Centipede
  "6Bu7d_Pkm5o": 0.098, // Scorpion
  "9xOaiLvBLF-": 0.08, // Earthworm
  "1thGVw33gOi": 0.079, // Earthworm
  "5qpRFOLShAQ": 0.06, // Earthworm
  "6Isq2Aqy4MR": 0.08, // Earthworm
  "5_XBqyrOY7x": 0.16, // Bat
  "5-MuhNMDmY_": 0.15, // Bat
  "a6ZmdFKog_u": 0.07, // Bat
  "29hG1_J1Uiq": 0.26, // Capuchin
  "8J_6QDW6au1": 0.2, // Squirrel monkey
  "0yRz2AkLuuo": 0.33, // monkey
  "fzCu8FM0HfB": 0.48, // Koala
  "dJW3JeUWXQ-": 0.45, // River otter
  "51WUJKGFW93": 0.56, // Fox
  "10u8FYPC5Br": 0.6, // Fox
  "cuUeGYY_jQ_": 0.59, // Fox
  "2LZMldgUhTj": 0.62, // Gray fox
  "8k4cduyRhi4": 0.28, // Badger
  "fXBbhQr-T80": 0.34, // Badger
  "5f5lhqxsPLP": 0.58, // Coati
  "8KQ6ilys4oL": 0.42, // Ocelot
  "dc_78YWzT_R": 0.44, // Bear Cub
  "fwtA7VLrXPr": 0.32, // Beaver
  "9wn3If7Qgb4": 0.8, // Goose
  "5d10ZQ9QzuS": 0.7, // Lesser snow goose
  "0WRzrtCIIRp": 0.43, // Seagull
  "dUFuQoM-k3s": 0.43, // Seagull
  "eMNhHDZakYp": 0.25, // Flying gull
  "eV6_-Q9dMg9": 0.25, // Roadrunner
  "1wqLCnNFCgv": 0.35, // Pheasant
  "5ijiY1ScLbe": 0.5, // Common loon
  "aV5YI_5OOva": 0.3, // Black necked stilt
  "fNkq9CwSG6d": 0.47, // Great horned owl
  "dk_Z98m7THM": 0.44, // Cooper's hawk
  "6mUdkMMh2JT": 0.44, // Ferruginous hawk
  "cdRfEmOy4uu": 0.5, // Marsh hawk
  "5a9c1FYhnVb": 0.5, // Northern goshawk
  "8CDZPdQuNDe": 0.5, // Northern harrier
  "9adZAZ2BmGL": 0.48, // Red-tailed hawk
  "3auORoUPvs9": 0.5, // Sharp shinned hawk
  "brcb6xLELnz": 0.54, // Pig
  "6yc3isbjZST": 0.71, // Pig
  "6XC3XssJIU_": 0.6, // Pig
  "37rHvkGh3nT": 0.13, // Snake
  "2ovwPNrRijL": 0.07, // Snake
  "2W2sKWYvk8k": 0.19, // Trout
  "0HCLwTdxvz5": 0.25, // Trout
  "e_Lkl7E-Tc8": 0.32, // Kingfish
  "653otKgnnpx": 0.12, // Halibut
  "7NJlKSShDB0": 0.083, // Eel
  "eRb-GgLCnA7": 0.2, // Eel
  "dDzthiG8nr9": 0.12, // Eel
  "9re2iW8tOnP": 0.12, // Eel
  "aOY1Ae28E9k": 0.2, // Squid
  "6ar_2XbrzCp": 0.46, // Squid
  "7zWPX7vtBXO": 0.15, // Squid
  "9LEHkOtRl-q": 0.13, // Cuttlefish
  "5PxIqPamrag": 0.5, // Jellyfish
  "dA5osnS0Rzj": 0.5, // Jellyfish
  "f4iwEhEP3-d": 0.15, // Sea Urchin
  "7UsYZIZ_rhU": 0.13, // Clam
  "8675QcluLQX": 0.14, // Clam
  "65ObbG0O7Ze": 0.14, // Clam
  "bMbD7yiAnML": 0.9, // Turkey
  "4f31_AG9Iap": 0.9, // Turkey
  "0QTh_KUZRYE": 9.8, // Barn
  "dSsUaUlaxHk": 7.4, // Barn
  "5wrqegJ4NzT": 7.4, // Barn
  "epElsuhDoKg": 2.5, // Room
  "3qqka8Oxe2B": 3, // Bathroom
  "b90F1JhGrA4": 2.9, // Kitchen
  "9ycLAR71SmR": 0.88, // Bedroom
  "0R3kFJC3CKc": 2.2, // Closet and clothes
  "aeuJiuWdknv": 14, // Castle
  "aG0AF5d-zbY": 14, // Castle
  "10YxF0_NaMa": 6.8, // Castle
  "b_UDhVGwfY8": 4.1, // Fort
  "bk72ChfpGo-": 11, // Lighthouse
  "7x23fV_uCpi": 8.3, // Lighthouse
  "0t2ZYRBsqX-": 11, // Lighthouse
  "1O6BWfUB6ta": 12, // Lighthouse scene
  "aSFrJ2XJNyL": 4, // Pillar
  "1zS7ucaAd4J": 10, // Pagoda
  "5ii3ywpObcd": 8, // Temple
  "5tEY6_rR2wL": 3, // Cabana
  "5KNeQg_znOu": 3, // Hut
  "4CNw6ZPb4x3": 2.2, // Igloo
  "d-ad5gtnq8Z": 1.9, // Igloo
  "dJtgAOX15VZ": 1.9, // Igloo
  "8VLdvsxYaEg": 0.5, // Beach scene
  "8Fvi_imkoaD": 4.3, // Beach
  "bzLVwG4AzvA": 5.8, // Island
  "fG9iP5afr7U": 3.5, // Island
  "1jUt3HwyHfn": 4.4, // Island
  "8PJfF1Q0B7T": 1, // Sand castle
  "7SHEIv4x4nv": 1, // Sandcastle
  "3vUUYmsouMM": 1.1, // Garden
  "4Xlqz9IfdrV": 4.3, // Diner
  "82JBTSsWag4": 7, // Saloon
  "bF8mr05ofaY": 5.5, // Jail
  "8A4_SixIsmQ": 4.2, // Cemetery
  "eauUqGZWR0O": 6.4, // Cemetery scene
  "fk2GfvHXN1A": 0.24, // Rails
  "aZ7y77mq_u6": 2.6, // Elevator
  "1B9JneFqd-a": 2.5, // Curtains
  "4MomdpI0Jx6": 10, // Silo
  "3MY8xY_m2Yz": 10, // Silo
  "eJMQ9JILdN6": 10, // Silo
  "cmFRkvRgpiv": 4.9, // Silos
  "8n7KSxtET9J": 5.1, // Farm
  "5GDbUJV2vQb": 8.9, // Farm
  "dGQEp7aXvYz": 4.6, // Farm
  "bHyQe5jzdiQ": 7, // Farm house
  "ctIRaIM3zXu": 8, // Windmill
  "4Y4tjjVXFFD": 9, // Windmill
  "b7ELlnwTfKn": 8, // Windmill
  "9ula4286qq1": 12, // Water tower
  "3SVPY3nu1G9": 2, // Well
  "an8wpvcJi8X": 2, // Well
  "dTSrDa0oz0a": 4, // Cabin
  "5xli1AZx7tL": 4, // Cabin
  "1GpgtI-C05M": 4, // Cabin
  "f7uccD5iyz0": 4, // Log cabin
  "4ysmSywCpkZ": 6, // Tree House
  "5jnXittYHwG": 6, // Treehouse
  "b_p530Qy_-t": 4.5, // Gazebo
  "1aFJU-Pqpn8": 5, // Chimney
  "aQp17eqOPFn": 2.1, // Door
  "cifWk2vViR0": 2.1, // Door
  "6sqMmqfwKip": 0.17, // Door
  "9eedkubZNOO": 0.078, // Window
  "9SsQCtLXCNb": 0.22, // Window
  "92fKBKJ6aj0": 0.23, // Window
  "eKPRsuda1HN": 2, // Big window
  "0BEn8hO2Nbn": 1.4, // Square window
  "eGCQotGGUVo": 3, // Stair case
  "0pEtBW3giNY": 3, // Staircase
  "5LdUYfQlCNF": 2.9, // Brick wall
  "atIKFMlZf9-": 1, // Fence
  "6yOvqDNKyMB": 0.96, // Fence
  "8r5ZAEhrppD": 0.87, // Fence
  "cBoHb45Rbbl": 1.3, // Picket fence
  "5-EGHK67BxT": 0.43, // Picket fence
  "9LXddGLPnRF": 1, // Gate
  "aVsjwBOr0xQ": 0.73, // Gate
  "07oA3gKcvLt": 1.8, // Gate
  "d6lqRR2TU0i": 3, // Archway
  "ccxRFIgIvIL": 0.81, // Wood bridge
  "6LeCqyw00RK": 2, // Haystack
  "eWhaaKNh755": 1.5, // Field of wheat
  "dE73diXi82k": 2.5, // Field of corn
  "8yBTH_Bwfnn": 0.61, // Feeding trough
  "7qFs_DjjuVp": 2, // Scarecrow
  "7rvJk5Cc9T0": 0.53, // Wheelbarrow
  "cfe3sobX4dT": 0.52, // Wheelbarrow
  "0VPTwKNVxk2": 0.62, // Wheelbarrow
  "5TGoA5N14c5": 1.9, // Tractor
  "9J0ma6qneqK": 1.8, // Wagon
  "136bU5GesHs": 1.9, // Wagon
  "8HnKzYQeRYD": 2.5, // Wagon
  "edEe1ygZiHf": 0.053, // Pitchfork
  "fCeaY97tP4r": 0.78, // Shovel
  "eId80xrpjG6": 2.5, // Ladder
  "22QmtJi62zQ": 0.9, // Barrel
  "dcrlVo3eQ_S": 0.35, // Bucket
  "5LfzGFQ2yTw": 0.4, // Watering can
  "5S86YsVBun8": 1.2, // Mailbox
  "asIp36y3k0t": 0.5, // Bird house
  "0d4ExMmqXUV": 0.6, // Bird Cage
  "fq_bAKD1Khg": 0.09, // Birds nest
  "9u6O3jg_mSc": 0.6, // Hose wheel
  "1pdSPagFCub": 1, // Lawn mower
  "6tNIeYHCQ0-": 0.3, // Toolbox
  "aTcKrofhCXS": 0.45, // Anvil
  "0yWnGjF_FHD": 0.02, // Hand saw
  "2Z5-FkJ3AKX": 0.013, // Handsaw
  "2DrO3g2y_g2": 0.043, // Hatchet
  "enyBvm6bJQL": 0.011, // Wrench
  "9FUVwmzqucy": 1, // Crowbar
  "bOjbK_rGqRA": 0.5, // Gas can
  "9YMVn5hMiv8": 0.4, // Lantern
  "dSMm_V4sKNr": 0.5, // Saddle
  "cn2TLOaUBIn": 0.017, // Horseshoe
  "fV2smrXzOeP": 0.25, // Cow bell
  "6M8gKV365Cz": 0.25, // Cowbell
  "eaP9ogrSQFQ": 0.8, // Keg
  "0gLJ3kKkMEn": 0.8, // Keg of beer
  "3F0yCeWeTZP": 1.5, // Dumpster
  "0yT-YR5yO4L": 0.8, // Trash can
  "fw6F3liNvHQ": 0.7, // Trashcan
  "86_1dd-Z27K": 0.4, // Empty box
  "d69NgO3BXv1": 0.23, // Cinder block
  "8MWIRnfzcuS": 0.075, // Brick
  "7YIloiV4cAt": 8, // Telephone pole
  "8hhAxfVhxyf": 4.5, // Street lamp
  "ez9fM9NvtRB": 4, // Lamp post
  "fZykGFywa5D": 3, // Oil pump
  "aWBGhxXig8y": 0.4, // Picnic Basket
  "2RnsxiNMppu": 1.1, // Barbeque
  "1xek4l3U9gq": 0.39, // Camp fire
  "e6ZDG81V2O5": 1.5, // Tent
  "bsp0Uzr6cSI": 0.98, // Hammock
  "e-IJdcqZH4p": 2.5, // Swing set
  "3mFM6lFd9P9": 2.5, // Wood swing
  "dDe3njWPbg0": 2.2, // Slide
  "fBaX63DY389": 0.96, // Seesaw
  "44njxNdC0gt": 1.2, // Trampoline
  "2R5gjVusWRN": 1.3, // Above ground swimming pool
  "4KKY7CmNe_r": 2.2, // Fountain
  "2lN50Yn-K2_": 2.2, // Patio heater
  "936irBEUnpu": 2.2, // Beach umbrella
  "9TN4PyhWvz1": 1, // Beach chair
  "504DFE6EMeN": 0.7, // Tire
  "1Jr3nTJEMOu": 0.7, // Tire
  "cV6yx0v8Bfy": 0.7, // Tire
  "0yByYjelrMb": 1, // Tires
  "e6H1nsEp7br": 0.04, // Hubcap
  "edJLxRGWFzS": 2.7, // Truck
  "fv2QPJ3DJOY": 2.6, // Truck
  "36sY8cTSgKL": 2.3, // Truck
  "eRu2kPYOCa7": 2.3, // Car
  "75h3mi6uHuC": 1.5, // Car
  "akcsFuPMt3b": 3.1, // Van
  "bSUF7N6ZGmn": 1.6, // Jeep
  "8ACz9InIO0c": 1.8, // Convertible
  "8xacyNqdJ3t": 3.2, // Schoolbus
  "aiDmjN8uOmA": 2.4, // Caravan
  "c2SYxaiPfF3": 1.5, // Boat
  "8vekojz4Abf": 0.6, // Boat
  "e02dSDtIoo1": 1.3, // Boat
  "dt1yhb5AYXD": 0.73, // Rowboat
  "1ezQ4a2dwVX": 0.64, // Canoe
  "20qFHKv9i2Z": 0.44, // Kayak
  "7AOnch2wREC": 6, // Sailboat
  "dfSQmeuuYt3": 3.4, // Submarine
  "3hkutVs0AAV": 1.2, // Go kart
  "19VoUuA2pcN": 0.99, // Bicycle
  "edNZoeH3lVP": 1, // Bike
  "fj-aQ4hAbNr": 0.65, // Tricycle
  "c4eT6ivB_Tm": 1, // Unicycle
  "eHdEFPwUfCt": 0.69, // Scooter
  "7Dfn4VtTCWY": 0.12, // Skateboard
  "5_MTCnqfUTr": 1.4, // Motorcycle
  "1_Sd_OBmf5P": 0.43, // Sled
  "bK-kUCyS7os": 12, // Hot air balloon
  "7eSQwXI898e": 12, // Hot air balloon
  "8k-_dqRf1C2": 8.5, // Hot air balloon
  "45-KKnBcxvE": 5.8, // Blimp
  "cr7RPZ4RfGM": 10, // Airship
  "42PQqEaxb-P": 12, // Rocket ship
  "4mPkOKdzAk-": 12, // Rocket ship
  "5EkSRo_-wL8": 3.7, // Rocket ship
  "8iKIYCyvh2k": 6, // Rocketship
  "eohMeC0WMlM": 4, // UFO
  "fojR5i3h_nh": 2.5, // Flying saucer
  "a19dX3Vgo3S": 0.9, // Jetpack
  "eeoGDcg9a-a": 1, // Wheelchair
  "4lhRcMbl1pw": 1, // Shopping cart
  "bIYbhKwE4L0": 0.089, // Steering wheel
  "bnFWquDqjEp": 3, // Propeller
  "fjAwIosTQHy": 1, // Anchor
  "7n1vrlFN0GH": 0.15, // Life preserver
  "bIRUD686yoA": 1.3, // Hang glider
  "3Z7vJ96JIEB": 3.7, // Parachute
  "e9-mepLIq0X": 0.9, // Chair
  "49lEx3gLfn9": 0.9, // Chair
  "13AL0KYItKD": 0.9, // Chair
  "7Jl72KgiRl-": 0.9, // Wood chair
  "4QKlmmd0v2b": 0.78, // Couch
  "9dHdNAcgrLM": 0.37, // Ottoman
  "3fBR37WefHM": 1.5, // Lamp
  "bc6txJTwfJj": 0.45, // Desk lamp
  "0zkVPX0T5k8": 1.9, // Bookcase
  "9NZBndzMCRo": 1.8, // Bookshelf
  "4S1nr7WmUxm": 0.052, // Book
  "cLydFlVg-wI": 0.6, // Stool
  "d0CwibBQX6A": 0.6, // Stool
  "2UeLZTX5nHr": 0.6, // Stool
  "63U8J3bGSaO": 0.8, // Barstool
  "fnTN9aw1q25": 0.75, // Table
  "8ifQ8a92xw_": 0.75, // Table
  "5bfpRNo-l3O": 0.75, // Table
  "5qMpo1d61bW": 0.8, // Big table
  "5_1VV3ExWC9": 0.82, // Bed
  "4iV2yZ0wIf1": 0.88, // Crib
  "fueH4_5W9Ug": 1.3, // Fireplace
  "d7rvLCzGFgM": 0.95, // Stove
  "0YYExMzwX0V": 0.3, // Microwave
  "3Yk9X7TB4KZ": 0.25, // Toaster
  "8k0dRGrWOOd": 0.4, // Blender
  "48_IoteMeNx": 0.16, // Clothes iron
  "4jf7PTHIMTe": 0.6, // Picture frame
  "3dycV-ViQH-": 0.058, // Wall painting
  "flynTOOHK_z": 0.45, // Vase
  "epuypdA3tpO": 0.013, // Rug
  "5sYEzPA8SLd": 0.023, // Oriental rug
  "bXH5RpSa88Q": 0.031, // Modern rug
  "9-VaFd57fTT": 1.8, // Coat rack
  "2qdm7DZVG94": 2, // Closet
  "dvn5SGMpjPm": 0.61, // Credenza
  "dptlMEX4tF_": 0.71, // Desk
  "fAfJzZmQpgY": 0.55, // Shelf
  "6UQpoYGTvkL": 1.6, // Easel
  "ezEfa_eupwK": 0.7, // Luggage
  "7Y-V-rdyvi6": 0.36, // Briefcase
  "1Xudt9ErVxm": 0.75, // Toilet
  "1YoE664mJTd": 1.3, // Piano
  "4t8wFjBwJVI": 0.35, // Alarm clock
  "0bcQotWTmTi": 1.8, // Clock
  "crXBxFOkCIp": 0.4, // Cash register
  "fIK34Yaek_W": 0.19, // Big red button
  "7hgc-RhOFEA": 0.4, // Lava lamp
  "bN280ReeZvq": 1.5, // Snowman
  "1r13EOcQbN3": 0.17, // Plunger
  "27L_cxLe_31": 0.3, // Roll of toilet paper
  "bL_hCXI0e4s": 0.059, // Bathroom scale
  "dwLFqHHYBxB": 0.32, // Sewing machine
  "dvu1_2Wlhc0": 1, // Ice box
  "aGZ6Omw-afY": 0.9, // Clothes dryer
  "eJ96_O_dQ2p": 1, // Vacuum
  "ftrnBGmhoFz": 0.7, // Radiator
  "a2ManZQPrEn": 0.15, // Large fan
  "3zLvCV8oh_O": 0.76, // Ceiling fan
  "3pxNWuQ-iii": 0.35, // Teapot
  "cjvm-bUFBAW": 1.5, // Mirror
  "6ssvUix7Ycr": 0.3, // Light bulb
  "fX-TdDiGv5V": 0.3, // Lightbulb
  "dD2RIIea6WR": 0.3, // Magnet
  "4hAw8zQHeMJ": 0.033, // Gears
  "ftwotKXssxx": 0.3, // Spring
  "12v6b2zWmSG": 0.23, // Birthday candles
  "2LU0ahKH437": 0.03, // Holiday lights
  "4k6N3JZsGHs": 0.0081, // Ornament
  "19SgehGpvrF": 0.35, // Candy cane
  "8diHwxl9PEK": 0.12, // Fortune cookie
  "cuIw8qvi-3T": 0.02, // Gingerbread man
  "4-d0cvpHjpS": 0.5, // Record player
  "a_NspNjwTYv": 0.0024, // Vinyl record
  "8LpwRvsVEXc": 0.12, // TV
  "9Qc5EtYmJry": 0.13, // Old computer
  "7jHiQIMZkRs": 0.3, // Videogame
  "5CNAkJAhHVV": 0.35, // Hal 9000
  "az2GQvMKWr4": 0.6, // Boom box
  "4hZk7Fg8KiP": 0.35, // Boombox
  "3N5cUYDN30g": 0.29, // Hi-fi stereo
  "102E7hcxEPT": 1.6, // Harp
  "4yO-XrJiBlc": 0.076, // Violin
  "c3RNKJflc4O": 0.5, // Drum
  "eoSib2-NN9Y": 1, // Electric guitar
  "ccd__UcZBye": 0.11, // Acoustic guitar
  "dKjB2Gm4-rj": 0.27, // Trumpet
  "c3iMv3-DFuh": 1.5, // Gong
  "4tAGfJTheb4": 0.6, // Bongos
  "2cDNCSVfAfv": 0.3, // Microphone
  "5AcolbPvaM9": 0.7, // Speaker
  "07HIaB3bO8X": 0.3, // Joystick
  "6ylnerfBjXZ": 0.28, // Bullhorn
  "3ti6jnq4VAJ": 0.043, // Walkie talkie
  "aR5ot8Z7_-v": 0.022, // Cassette tape
  "7EBZEOgoWNv": 0.15, // Google cardboard
  "9A6cuitiB_4": 1.5, // Robot
  "cpuBFAjcz90": 0.24, // Domestic robot
  "f4rVzJd_dgX": 0.1, // Domestic robot
  "1ZoSwQQOBJX": 1.4, // Telescope
  "61JbLjEpcJT": 5.6, // Hubble telescope
  "5iVbfDhRnN7": 3, // Satellite dish
  "1C3zb8Q9USk": 0.79, // Satellite
  "7Hklkby17fr": 1, // Sputnik
  "dLHpzNdygsg": 1.8, // Astronaut
  "6FrJ3_CzH8S": 1.2, // Alien
  "5WERTPcyIMn": 0.12, // Roomba
  "e4IlfNvD0_w": 0.6, // Bomb
  "dPVCvXP-S58": 1.2, // Missile
  "djxolbz_CYC": 14, // Space Shuttle
  "8mBtwh19WWS": 1.8, // Periscope
  "dQj7UZT-1w0": 0.07, // Robot vacuum
  "advGpqPqy0P": 0.3, // Erlenmeyer flask
  "a6fAmpBmWHM": 0.3, // Beaker
  "5mPRPZkI3qt": 0.29, // Brain
  "8gkFBBcS6aM": 8, // Volcano
  "cNmJWvV7Piz": 3.1, // Rainbow
  "63c8LKpoXTO": 4, // Moon
  "dhLVA8z7cGo": 2.5, // Space rover
  "5m29ktvPyZy": 3, // Mk12 command pod
  "8oI7oWBA1V8": 3, // Command pod
  "bLpQhKoSI3o": 0.54, // Sputnik satellite
  "f5AfWX7Fyeb": 2.4, // Dinosaur
  "9GyZw9gGPMq": 4.5, // T-Rex
  "12n6ICAVpYB": 5.1, // Diplodocus
  "cdbfm0fJFU_": 0.4, // Trophy
  "cX6NECw97x7": 0.52, // Moose antlers
  "9oH6TjelO-W": 0.66, // Antlers
  "dbShsyLjdc6": 0.39, // Antler
  "212RNECqFCA": 1.8, // Unicorn
  "aQ6YU1JK1wC": 5, // Dragon
  "bpFCWQSs-aT": 1.6, // Throne
  "aIW687xg5M4": 0.35, // Crown
  "4nGzqEUog7O": 0.8, // Safe
  "00gto_PcYMp": 1.4, // Cannon
  "9ahVI0EijEi": 2.8, // Catapult
  "egmks2_joYD": 0.36, // Coffin
  "125x68MbyA0": 1, // Gravestone
  "5UEm2WWSmjo": 0.19, // Genie's lamp
  "26F-mHntpvj": 0.5, // Magic wand
  "a6l-8cOgbR_": 0.4, // Hourglass
  "0nA658LJlU7": 0.4, // Hour Glass
  "1kgsY8kDKT_": 0.6, // Candelabra
  "5x7GOmvt0Tk": 0.13, // Bone
  "6InWFmvjYZS": 0.049, // Trident
  "40LBkajLUig": 0.27, // Mace
  "bKgxmU7f5-j": 0.07, // Wishbone
  "eKyOgAaDCCV": 0.35, // Pirate hook
  "5jiuuz7sOV_": 0.5, // Halo
  "09p9-Mnp4Sc": 0.3, // Gem
  "816yhHDAybh": 0.3, // Diamond ring
  "eyzMh_ozkF4": 0.4, // Pearl necklace
  "0QjRoZvnOKT": 0.04, // Coin
  "0w-WpQf7O9J": 0.086, // Gold
  "0J_HflIStKl": 0.4, // Key
  "arIYNl9gMyr": 0.096, // Scroll
  "6yKiq1_NH5K": 0.19, // Gavel
  "6nj5FdUlsEW": 0.1, // Binoculars
  "fvtGqQ6olh-": 0.4, // Magnifying glass
  "eNR_DPPP1Hp": 0.19, // Teeth
  "9AUcVMxZLCp": 0.4, // Nose
  "btWmPNVSKUc": 0.18, // Hand
  "5POtMKIT_Ze": 0.35, // Heart
  "9pffFcv7LSm": 0.3, // Rubber Duck
  "7RQbiSQVGNy": 0.4, // Bowling pins
  "92eI1h_UJpU": 0.38, // Bowling pin
  "dCmNk08B6gs": 0.3, // Football helmet
  "2I7bKP-zF6j": 0.25, // Eight ball
  "fiTYFFnk8zT": 0.25, // Rubik's cube
  "diUjohGgQnJ": 0.042, // Etch a Sketch
  "88CP80Kgb-u": 1, // Earth
  "dpvS2kdW6I9": 0.3, // Piggy bank
  "aODw_lbKxQP": 1.5, // Punching bag
  "08Gs4e3L1N8": 0.3, // Kettlebell
  "0oKmmPJ_cD8": 2.3, // Bouncy castle
  "cYbPVv0xBbK": 0.15, // Juggling ball
  "8Qq-NaPoBt6": 0.0062, // Kite
  "dH1ooiknhFO": 0.13, // Hover board
  "88rS_iRuvTh": 0.34, // Hoverboard
  "c8krVNpkT-x": 0.2, // Pool ball
  "dt1_LCub60M": 0.25, // Dice
  "2T3RWLeAudL": 0.029, // Poker chip
  "aW5HcCo0KZa": 0.3, // Knight chess piece
  "0Iwry_4fNw0": 0.3, // Bishop
  "fXbCgbsujx4": 0.25, // Pawn
  "51T1pmZ73vP": 0.033, // Frisbee
  "7lesi0f7J82": 0.06, // Baseball bat
  "72XCHXgHlg7": 0.039, // Tennis racket
  "7Ap2g6_26po": 1.2, // Hockey stick
  "fnDmeCySRhV": 0.3, // Soccer ball
  "eopD_12UuB8": 0.3, // Basketball
  "dkwqsVsI2R0": 0.31, // Surfboard
  "dxSNUJtW4QG": 14, // Ferris wheel
  "1PP65IsuNwv": 0.3, // Top hat
  "aWzUlZtGLC0": 0.18, // Cowboy hat
  "73a4yE7VyqD": 0.2, // Pirate hat
  "7VVumyY7L_u": 0.55, // Wizard hat
  "7fGDqHvHap1": 0.18, // Sombrero
  "ez4MoDQFgXz": 0.9, // Umbrella
  "4uOho8GeU_w": 0.96, // Open umbrella
  "0D0BJl1Esi4": 0.0045, // Mustache
  "8JXxwJPbL6K": 0.36, // Bunny ears
  "eFxqLZsis1O": 0.4, // Rubber boot
  "9Qf1MHGePvS": 0.35, // Cowboy boots
  "4v0sRFH6PN9": 0.23, // Graduation cap
  "ayNYjI4jcW4": 0.18, // Sheriff Hat
  "8TpZrCG3aRf": 0.15, // Fedora
  "aaC5GgcWEhM": 0.14, // Baseball cap
  "9AMKar2NlkX": 0.2, // Hard hat
  "81nsVRXaniY": 0.11, // Beanies
  "dqzY-cxJJsZ": 2.2, // Payphone
  "3ClNhQ5dOGt": 2.8, // Stop sign
  "57rxXzowK8w": 4, // Traffic light
  "eNPaSEPrst8": 0.8, // Fire hydrant
  "2Kl87jaGQEB": 6, // Billboard
  "2WvdDP8C3a5": 0.5, // Cake
  "8KY9R5UDV_M": 0.14, // Donut
  "fJxUxqZuPt1": 0.5, // Pumpkin
  "cggu6F8hvCm": 0.5, // Jack-O-Lantern
  "7GZPJAKtU-C": 0.14, // Hot dog
  "9VFJXXILhdE": 0.33, // Hamburger
  "eke7qcu_FR2": 0.18, // Cheeseburger
  "0W4JDAPuTZf": 0.14, // Burger
  "e29LlIx3T2F": 0.046, // Slice of pizza
  "9v96IZSZCXQ": 0.4, // Pizza slice
  "3qiDGMVEqmd": 0.4, // Ice cream
  "4izwZR51zhZ": 0.4, // Soft serve ice cream
  "534TY_Ie4jz": 0.4, // Popsicle
  "4zZE7UiKdU3": 0.4, // Lollipop
  "eu-vRr2-5dY": 0.12, // Pie
  "fUCvg9N-5ta": 0.17, // Apple pie
  "8Xmx93RrgDT": 0.1, // Cookie
  "3Y86ws7pr6R": 0.15, // Banana
  "8mSuB-1kfRm": 0.09, // Carrot
  "4DecLEjZUrg": 0.3, // Cheese
  "8TMPYVGan_T": 0.3, // Gummy bear
  "3xseQxXMXPL": 0.3, // Egg
  "9FPF7CPKf7M": 0.3, // Pretzel
  "1s5ZjBuJlaU": 8, // Tree
  "eOL74SKw9NG": 8, // Tree
  "a1wdtgJp6Or": 8, // Tree
  "0DtsZfSTWzA": 10, // Oak tree
  "cpg6wP8JCyQ": 5, // Apple tree
  "8OfF21t6NMa": 9, // Maple tree
  "b0BZj34bN-K": 9, // Birch tree
  "fCT73jIf5jN": 12, // Pine tree
  "ffuZy01LjQU": 12, // Pine tree
  "7rTNpk6j01O": 5, // Pine tree
  "5mED_iGhudj": 12, // Fir tree
  "ahT2_ZxtLIq": 12, // Spruce tree
  "aPFov1IaCWu": 5, // Dead tree
  "2acu5nrdDYl": 8, // Willow tree
  "74_FuSwEd0E": 8, // Weeping willow
  "fSY0MW1tzEl": 4, // Small Trees
  "dTy_L-TMS2z": 8, // Trees
  "7etYPFVlpgm": 0.6, // Tree stump
  "dkRLlPSdgdR": 0.94, // Log
  "8K4i-xjd8Ep": 0.54, // Wood
  "8w-ed__H6Tl": 1.5, // Tree branch
  "aMGUklRjpyo": 1.2, // Shrub
  "aI3Wtnkueq7": 1.2, // Rose bush
  "fR4tQufNJcK": 1, // Rosebush
  "dmRuyy1VXEv": 1, // Rock
  "9YaAwJFsHMj": 1, // Rocks
  "3jql0qtape-": 1.5, // Boulder
  "50q_bJkLcuq": 0.5, // Stone
  "0vAJVcMEFdv": 0.16, // Stones
  "3tyh15Fbmsx": 0.4, // Tuft of grass
  "22RjqsDdegr": 0.078, // Tuft of grass
  "9S_Vjc9yqp0": 0.4, // Grass
  "eydI4__jXpi": 0.5, // Flower
  "9znAp0dJiS8": 0.037, // Flower
  "ce4GXw3VYE5": 1.5, // Sunflower
  "ckAqqaCskMy": 0.5, // Daisy
  "ciFymz3YR9I": 0.45, // Tulip
  "aaJtRIXws3U": 0.5, // Tulips
  "2Gw0Pca1YRS": 0.45, // Daffodil
  "bRp3GPJJJoG": 0.5, // Rose
  "fo-P-qRPeRZ": 0.4, // Dandelion
  "01h5sEA40Hp": 0.7, // Mushroom
  "1_3Ur2-LAs8": 2, // Cactus
  "5-hrumGDq1K": 0.6, // Barrel cactus
  "1SyGonHVM0L": 0.8, // House plant
  "2aH4y6SWnXz": 0.8, // House plants
  "8KMKYzAqWjp": 0.8, // Plant
  "1BtyNc_gX5a": 0.5, // Bonsai
  "1ufwWhb0Dlj": 2.5, // Ivy
  "eI7GSQpnVUL": 2.5, // Vine
  "cnimalnLIEA": 2, // Vines
  "7v1ouc7EWYX": 0.3, // Clover
  "9uT74BMpRrl": 1.5, // Cattail
  "5rf3YuZfJAW": 1.7, // Pond
  "0ySmwTitJrP": 0.8, // Tumbleweed
  "4siom7-sFLN": 1, // Wheat
  "5PEyOwPaKlg": 2, // Corn
  "8xHS2Js0MA_": 0.044, // Lily pad
  "8xnrovrzfAe": 0.46, // Dog
  "5YaZxSwLgXR": 0.22, // Rabbit
  "co7Yy70H7-d": 0.11, // Mouse
  "7sQHkW0ylJy": 0.43, // Gull
  "6Tpj_vcWP3f": 0.25, // Flying seagull
  "8SLzmdKT7t_": 0.25, // Roadrunner
  "emvqBiIhl-C": 0.35, // Pheasant ring-necked
  "6Sa-07wTq-Z": 0.44, // Cooper's hawk
  "f-o9KWtLx6C": 0.5, // Northern goshawk
  "a5k7SXAohHB": 0.5, // Northern harrier
};
